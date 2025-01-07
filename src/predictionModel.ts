import DatabaseManager, { InteractionRecord } from './databaseManager';

type InteractionData = {
    componentId: string;
    timestamp: number;
};

class PredictionModel {
    private historyLength: number;
    private decayRate: number;
    private userHistory: InteractionData[];
    private transitionMatrix: Map<number, Map<string, Map<string, number>>>;
    private globalActionCounter: Map<string, number>;
    private timePatterns: Map<string, Map<number, number>>;

    constructor(historyLength = 200, decayRate = 0.9) {
        this.historyLength = historyLength;
        this.decayRate = decayRate;
        this.userHistory = [];
        this.transitionMatrix = new Map();
        this.globalActionCounter = new Map();
        this.timePatterns = new Map();

        const databaseManager = DatabaseManager.getInstance();
        databaseManager.onInteractionSaved((interaction) => this.updateModel(interaction));
        console.log('PredictionModel subscribed to database updates.');
    }

    public async initializeFromDatabase(): Promise<void> {
        const databaseManager = DatabaseManager.getInstance();
        const allInteractions = await databaseManager.getAllInteractions(); // Assuming this method exists
        console.log(`Fetched ${allInteractions.length} interactions from database.`);

        this.processHistoricalData(allInteractions);

        const predictedAction = this.predictNextAction(Date.now());
    }

    private processHistoricalData(interactions: InteractionRecord[]): void {
        interactions.forEach((interaction) => {
            this.updateTransitionMatrix(interaction.componentId, interaction.timestamp);
        });
        console.log('Processed historical data and updated transition matrix.');
    }

    private updateModel(interaction: InteractionRecord): void {
        this.updateTransitionMatrix(interaction.componentId, interaction.timestamp);
        console.log(`Updated model with interaction: ${JSON.stringify(interaction)}`);

        const nextAction = this.predictNextAction(Date.now());
        console.log(`Predicted next action: ${nextAction}`);
    }

    private updateTransitionMatrix(actionName: string, timestamp: number): void {
        const date = new Date(timestamp);
        const hour = date.getHours();

        if (!this.timePatterns.has(actionName)) {
            this.timePatterns.set(actionName, new Map());
        }
        const timeData = this.timePatterns.get(actionName)!;
        timeData.set(hour, (timeData.get(hour) || 0) + 1);

        this.globalActionCounter.set(actionName, (this.globalActionCounter.get(actionName) || 0) + 1);

        const history = this.userHistory;

        if (history.length > 0) {
            for (let length = 2; length <= Math.min(5, history.length); length++) {
                const pattern = history.slice(-length).map(h => h.componentId).join(',');
                if (!this.transitionMatrix.has(length)) {
                    this.transitionMatrix.set(length, new Map());
                }
                const level = this.transitionMatrix.get(length)!;
                if (!level.has(pattern)) {
                    level.set(pattern, new Map());
                }
                const transitions = level.get(pattern)!;
                transitions.set(actionName, (transitions.get(actionName) || 0) + 1);
            }
        }

        this.userHistory = [...history.slice(-this.historyLength), { componentId: actionName, timestamp }];
    }

    public predictNextAction(timestamp: number) {
        const history = this.userHistory;
        if (!history.length) return { action: this.getMostFrequentAction(), componentId: null };

        for (let length = Math.min(4, history.length); length > 1; length--) {
            const pattern = history.slice(-length).map(h => h.componentId).join(',');
            const possibleActions = this.transitionMatrix.get(length)?.get(pattern);
            if (possibleActions) {
                const weightedActions = Array.from(possibleActions.entries()).map(([action, count]) => {
                    return { action, weight: count * this.applyDecay(length) };
                });
                const bestAction = weightedActions.reduce((a, b) => (a.weight > b.weight ? a : b)).action;
                const componentId = history[history.length - 1].componentId;
                console.log(`Предсказанное действие на основе матрицы переходов: ${bestAction} и компонент: ${componentId}`);
                return { action: bestAction, componentId };
            }
        }

        if (timestamp) {
            const currentHour = new Date(timestamp).getHours();
            const timeWeightedAction = Array.from(this.timePatterns.entries()).map(([action, timeData]) => {
                return { action, weight: timeData.get(currentHour) || 0 };
            }).reduce(
                (a: { action: string | null; weight: number }, b: { action: string; weight: number }) =>
                    (a.weight > b.weight ? a : b),
                { action: null, weight: 0 }
            );
            if (timeWeightedAction.weight > 0) {
                console.log(`Предсказанное действие на основе временных паттернов: ${timeWeightedAction.action}`);
                return { action: timeWeightedAction.action, componentId: null };
            }
        }

        const fallbackAction = this.getMostFrequentAction();
        console.log(`Предсказанное действие на основе наиболее частого действия: ${fallbackAction}`);
        return { action: fallbackAction, componentId: null };
    }

    private getMostFrequentAction(): string | null {
        if (!this.globalActionCounter.size) return null;
        return Array.from(this.globalActionCounter.entries()).reduce((a, b) => (a[1] > b[1] ? a : b))[0];
    }

    private applyDecay(length: number): number {
        return Math.pow(this.decayRate, length);
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
