// predictionModel.ts

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

    constructor(
        historyLength = 100,
        decayLambda = 0.0005,
        smoothingFactor = 1,
        weightSequence = 0.7,
        weightTime = 0.3,
        maxPatternLength = 5
    ) {
        this.historyLength = historyLength;
        this.decayLambda = decayLambda;
        this.smoothingFactor = smoothingFactor;
        this.weightSequence = weightSequence;
        this.weightTime = weightTime;
        this.maxPatternLength = maxPatternLength;

        this.userHistory = [];
        this.transitionMatrix = new Map();
        this.globalActionCounter = new Map();
        this.timePatterns = new Map();
        this.componentTracker = ComponentTracker.getInstance();

        const databaseManager = DatabaseManager.getInstance();
        databaseManager.onInteractionSaved((interaction) => this.updateModel(interaction));
    }

    public async initializeFromDatabase(): Promise<void> {
        const databaseManager = DatabaseManager.getInstance();
        const allInteractions = await databaseManager.getAllInteractions();
        this.processHistoricalData(allInteractions);
        this.predictNextAction(Date.now());
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
        if (!history.length) {
            const fallback = this.getMostFrequentAction();
            const componentId = fallback ? this.componentTracker.getComponentByAction(fallback) : null;
            return { action: fallback, componentId };
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
    await predictionModelInstance.initializeFromDatabase();
})();
export default predictionModelInstance;
