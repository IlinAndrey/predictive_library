//componentPreloader.ts
import predictionModelInstance from './predictionModel';
import ComponentTracker from './componentTracker';

class ComponentPreloader {
    private componentTracker: ComponentTracker;
    private componentCache: Map<string, any>;

    constructor() {
        this.componentTracker = ComponentTracker.getInstance();
        this.componentCache = new Map<string, any>();
    }

    public preloadNextComponent(): void {
        const prediction = predictionModelInstance.predict(Date.now());
        if (prediction.componentId) {
            this.preloadComponent(prediction.componentId);
        } else {
            console.warn('Context error');
        }
    }

    public preloadComponent(componentId: string): void {
        if (this.componentCache.has(componentId)) {
            console.log(`Компонент ${componentId} уже предзагружен и находится в кэше.`);
            return;
        }

        const componentData = this.componentTracker.getTrackedComponents().find(c => c.id === componentId);
        if (componentData) {
            this.componentCache.set(componentId, componentData);
            console.log(`Компонент ${componentData.id} типа ${componentData.type} предзагружен и сохранен в кэш.`);
        } else {
            console.warn(`Компонент с id '${componentId}' не найден для предзагрузки.`);
        }
    }
}

export default ComponentPreloader; 