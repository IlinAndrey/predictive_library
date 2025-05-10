import DatabaseManager, { InteractionRecord } from './databaseManager';
import ComponentPreloader from './componentPreloader';
import ComponentTracker from './componentTracker';

type InteractionData = {
    componentId: string;
    actionType: string;
    timestamp: number;
    deviceType?: string;
    sessionId?: string;
    region?: string;
};

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_HEX) {
  throw new Error('ENCRYPTION_KEY is not defined in .env or build configuration');
}
if (ENCRYPTION_KEY_HEX.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
  throw new Error(`ENCRYPTION_KEY must be a 64-character hexadecimal string. Got: "${ENCRYPTION_KEY_HEX}"`);
}
const ENCRYPTION_KEY = new Uint8Array(
  ENCRYPTION_KEY_HEX.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
);

class PredictionModel {
    private historyLength: number;
    private decayLambda: number;
    private smoothingFactor: number;
    private userHistory: InteractionData[];
    private transitionMatrix: Map<number, Map<string, Map<string, number>>>;
    private globalActionCounter: Map<string, number>;
    private timePatterns: Map<string, Map<number, number>>;
    private componentTracker: ComponentTracker;
    private maxPatternLength: number;
    private weightSequence: number;
    private weightTime: number;
    private appId: string | null;
    private serverUrl: string;
    private minActionsThreshold: number;
    private dailyUploadInterval: NodeJS.Timeout | null;

    constructor(
        serverUrl: string = 'http://localhost:3001',
        historyLength = 100,
        decayLambda = 0.0005,
        smoothingFactor = 0.1,
        weightSequence = 0.7,
        weightTime = 0.3,
        maxPatternLength = 5,
        minActionsThreshold = 50
    ) {
        this.appId = null;
        this.serverUrl = serverUrl;
        this.historyLength = historyLength;
        this.decayLambda = decayLambda;
        this.smoothingFactor = smoothingFactor;
        this.weightSequence = weightSequence;
        this.weightTime = weightTime;
        this.maxPatternLength = maxPatternLength;
        this.minActionsThreshold = minActionsThreshold;

        this.userHistory = [];
        this.transitionMatrix = new Map();
        this.globalActionCounter = new Map();
        this.timePatterns = new Map();
        this.componentTracker = ComponentTracker.getInstance();
        this.dailyUploadInterval = null;

        const databaseManager = DatabaseManager.getInstance();
        databaseManager.onInteractionSaved((interaction) => this.updateModel(interaction));
    }

    private ivMap: Map<string, string> = new Map();

    private loadIvMap() {
        const raw = localStorage.getItem('ivMap');
        if (raw) this.ivMap = new Map(JSON.parse(raw));
    }

    private saveIvMap() {
        localStorage.setItem('ivMap', JSON.stringify(Array.from(this.ivMap.entries())));
    }

    private async encryptDeterministic(data: string): Promise<{ ciphertext: string; iv: string }> {
        let ivBase64 = this.ivMap.get(data);
        if (!ivBase64) {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          ivBase64 = btoa(String.fromCharCode(...iv));
          this.ivMap.set(data, ivBase64);
          this.saveIvMap();
        }
        const ivBytes = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
        const key = await this.getCryptoKey();
        const encoded = new TextEncoder().encode(data);
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, encoded);
        const ciphertext = btoa(String.fromCharCode(...new Uint8Array(ct)));
        return { ciphertext, iv: ivBase64 };
    }

    private async getCryptoKey(): Promise<CryptoKey> {
        return await crypto.subtle.importKey(
            'raw',
            ENCRYPTION_KEY,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    private async encrypt(data: string): Promise<{ ciphertext: string; iv: string }> {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.getCryptoKey();
        const encodedData = new TextEncoder().encode(data);
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encodedData
        );
        return {
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            iv: btoa(String.fromCharCode(...iv))
        };
    }

    private async decrypt(ciphertext: string, iv: string): Promise<string> {
        try {
            const key = await this.getCryptoKey();
            const ciphertextBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
            const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: ivBytes },
                key,
                ciphertextBytes
            );
            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('Decryption error:', error);
            throw error;
        }
    }

    public async initialize(): Promise<void> {
        try {
            await this.registerApp();
            this.scheduleDailyUpload();
            const databaseManager = DatabaseManager.getInstance();
            const allInteractions = await databaseManager.getAllInteractions();
            this.processHistoricalData(allInteractions);
            await this.checkAndFetchGlobalModel();
            this.predictNextAction(Date.now());
            console.log('PredictionModel initialized successfully. userHistory length:', this.userHistory.length);
        } catch (error) {
            console.error('Error initializing PredictionModel:', error);
        }
    }

    public async forceUploadData(): Promise<void> {
        console.log('Forcing data upload. userHistory:', this.userHistory);
        await this.uploadAnonymizedData();
    }

    private async registerApp(): Promise<void> {
        const storageKey = 'prediction_model_app_id';
        let storedAppId = null;

        if (typeof window !== 'undefined' && window.localStorage) {
            storedAppId = localStorage.getItem(storageKey);
        }

        if (storedAppId) {
            this.appId = storedAppId;
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/register-app`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to register app');
            this.appId = data.appId;
            if (typeof window !== 'undefined' && window.localStorage && this.appId) {
                localStorage.setItem(storageKey, this.appId);
            }
            console.log('App registered with appId:', this.appId);
        } catch (error) {
            console.error('Error registering app:', error);
            this.appId = 'fallback-' + Date.now();
        }
    }

    private scheduleDailyUpload(): void {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const timeUntilMidnight = midnight.getTime() - now.getTime();

        setTimeout(() => {
            this.uploadAnonymizedData();
            this.dailyUploadInterval = setInterval(() => this.uploadAnonymizedData(), 24 * 60 * 60 * 1000);
        }, timeUntilMidnight);
    }

    private async uploadAnonymizedData(): Promise<void> {
        if (!this.userHistory.length || !this.appId) return;
    
        const counts: Record<string, number> = {};
        this.userHistory.forEach(({ actionType }) => {
          counts[actionType] = (counts[actionType] || 0) + 1;
        });
    
        const anonymizedData: Array<{ actionType: string; actionTypeIV: string; count: number }> = [];
        for (const [actionType, count] of Object.entries(counts)) {
          const { ciphertext, iv } = await this.encryptDeterministic(actionType);
          anonymizedData.push({ actionType: ciphertext, actionTypeIV: iv, count });
        }
    
        try {
          const res = await fetch(`${this.serverUrl}/upload-anonymous-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appId: this.appId, interactions: anonymizedData })
          });
          if (!res.ok) throw new Error(res.statusText);
          console.log('Данные отправлены:', anonymizedData);
        } catch (e) {
          console.error('Ошибка отправки:', e);
        }
      }
      

    private async checkAndFetchGlobalModel(): Promise<void> {
        if (this.userHistory.length >= this.minActionsThreshold && this.transitionMatrix.size > 0 || !this.appId) {
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/global-model/${this.appId}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to fetch global model');

            this.globalActionCounter = new Map();
            for (const [encryptedAction, count] of Object.entries(data.globalActionCounter)) {
                const decryptedAction = await this.decrypt(encryptedAction, data.globalActionCounterIVs[encryptedAction]);
                this.globalActionCounter.set(decryptedAction, Number(count));
            }

            this.timePatterns = new Map();
            for (const [encryptedAction, hours] of Object.entries(data.timePatterns)) {
                const decryptedAction = await this.decrypt(encryptedAction, data.timePatternsIVs[encryptedAction]);
                const hourMap = new Map(Object.entries(hours as Record<string, number>).map(([h, c]) => [Number(h), Number(c)]));
                this.timePatterns.set(decryptedAction, hourMap);
            }
            console.log('Global model fetched successfully');
        } catch (error) {
            console.error('Error fetching global model:', error);
        }
    }

    private processHistoricalData(interactions: InteractionRecord[]): void {
        interactions.forEach((interaction) => {
            this.updateTransitionMatrix(interaction, interaction.timestamp);
        });
    }

    private updateModel(interaction: InteractionRecord): void {
        this.updateTransitionMatrix(interaction, interaction.timestamp);
        const nextAction = this.predictNextAction(Date.now());
        if (nextAction.componentId) {
            new ComponentPreloader().preloadComponent(nextAction.componentId);
        }
    }

    private updateTransitionMatrix(interaction: InteractionRecord, timestamp: number): void {
        const action = interaction.actionType;
        const hour = new Date(timestamp).getHours();

        if (!this.timePatterns.has(action)) {
            this.timePatterns.set(action, new Map());
        }
        const timeData = this.timePatterns.get(action)!;
        timeData.set(hour, (timeData.get(hour) || 0) + 1);

        this.globalActionCounter.set(action, (this.globalActionCounter.get(action) || 0) + 1);

        const history = this.userHistory;
        const maxLen = Math.min(this.maxPatternLength, history.length);

        for (let length = 1; length <= maxLen; length++) {
            const pattern = history.slice(-length).map(h => h.actionType).join(',');
            if (!this.transitionMatrix.has(length)) {
                this.transitionMatrix.set(length, new Map());
            }
            const level = this.transitionMatrix.get(length)!;
            if (!level.has(pattern)) {
                level.set(pattern, new Map());
            }
            const transitions = level.get(pattern)!;
            transitions.set(action, (transitions.get(action) || 0) + 1);
        }

        this.userHistory = [...history.slice(-this.historyLength), {
            componentId: interaction.componentId,
            actionType: action,
            timestamp: timestamp
        }];
    }

    private applyAdaptiveDecay(deltaT: number): number {
        return Math.exp(-this.decayLambda * deltaT);
    }

    private getSequenceProbabilities(): Map<string, number> {
        const now = Date.now();
        const history = this.userHistory;
        const seqProbs = new Map<string, number>();

        for (let length = 1; length <= Math.min(this.maxPatternLength, history.length); length++) {
            const pattern = history.slice(-length).map(h => h.actionType).join(',');
            const possibleActions = this.transitionMatrix.get(length)?.get(pattern);
            if (possibleActions) {
                const total = Array.from(possibleActions.values()).reduce((sum, c) => sum + c, 0);
                for (const [action, count] of possibleActions.entries()) {
                    const timeDelta = now - history[history.length - length].timestamp;
                    const decay = this.applyAdaptiveDecay(timeDelta);
                    const smoothedProb = (count + this.smoothingFactor) / (total + this.smoothingFactor * possibleActions.size);
                    const weighted = smoothedProb * decay;
                    seqProbs.set(action, (seqProbs.get(action) || 0) + weighted);
                }
            }
        }

        const totalWeight = Array.from(seqProbs.values()).reduce((a, b) => a + b, 0);
        if (totalWeight > 0) {
            for (const [action, weight] of seqProbs.entries()) {
                seqProbs.set(action, weight / totalWeight);
            }
        }

        return seqProbs;
    }

    private getTimeProbabilities(timestamp: number): Map<string, number> {
        const hour = new Date(timestamp).getHours();
        const totalPerHour = new Map<number, number>();

        for (const [, timeData] of this.timePatterns.entries()) {
            for (const [h, count] of timeData.entries()) {
                totalPerHour.set(h, (totalPerHour.get(h) || 0) + count);
            }
        }

        const total = totalPerHour.get(hour) || 0;
        const timeProbs = new Map<string, number>();

        if (total > 0) {
            for (const [action, timeData] of this.timePatterns.entries()) {
                const count = timeData.get(hour) || 0;
                timeProbs.set(action, count / total);
            }
        }

        return timeProbs;
    }

    private getMostFrequentAction(): string | null {
        if (!this.globalActionCounter.size) return null;
        return Array.from(this.globalActionCounter.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }

    private computeEntropy(distribution: Map<string, number>): number {
        let entropy = 0;
        for (const p of distribution.values()) {
            if (p > 0) entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    public predictNextAction(timestamp: number) {
        const history = this.userHistory;
        if (!history.length && !this.globalActionCounter.size) {
            return { action: null, componentId: null };
        }

        const seqProbs = this.getSequenceProbabilities();
        const timeProbs = this.getTimeProbabilities(timestamp);
        const combined = new Map<string, number>();
        const allActions = new Set([...seqProbs.keys(), ...timeProbs.keys()]);

        for (const action of allActions) {
            const ps = seqProbs.get(action) || 0;
            const pt = timeProbs.get(action) || 0;
            combined.set(action, this.weightSequence * ps + this.weightTime * pt);
        }

        if (combined.size > 0) {
            const sorted = Array.from(combined.entries()).sort((a, b) => b[1] - a[1]);
            const maxValue = sorted[0][1];
            const topCandidates = sorted.filter(([_, v]) => Math.abs(v - maxValue) < 1e-6);

            const bestAction = topCandidates.length === 1
                ? topCandidates[0][0]
                : topCandidates.sort((a, b) => this.computeEntropy(seqProbs) - this.computeEntropy(seqProbs))[0][0];

            const componentId = this.componentTracker.getComponentByAction(bestAction);
            return { action: bestAction, componentId };
        }

        const fallbackAction = this.getMostFrequentAction();
        const componentId = fallbackAction ? this.componentTracker.getComponentByAction(fallbackAction) : null;
        return { action: fallbackAction, componentId };
    }

    public predict(timestamp: number) {
        return this.predictNextAction(timestamp);
    }
}

const predictionModelInstance = new PredictionModel();
(async () => {
    await predictionModelInstance.initialize();
})();

export default predictionModelInstance;