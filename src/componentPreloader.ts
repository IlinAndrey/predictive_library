import predictionModelInstance from './predictionModel';
import ComponentTracker from './componentTracker';

class ComponentPreloader {
    private componentTracker: ComponentTracker;

    constructor() {
        this.componentTracker = ComponentTracker.getInstance();
    }

    /**
     * Предзагружает следующий предсказанный компонент.
     */
    public preloadNextComponent(): void {
        const prediction = predictionModelInstance.predict(Date.now());
        if (prediction.componentId) {
            this.preloadComponent(prediction.componentId);
        } else {
            console.warn('Не удалось предсказать следующий компонент для предзагрузки.');
        }
    }

    /**
     * Предзагружает компонент по его идентификатору.
     * @param componentId Идентификатор компонента для предзагрузки.
     */
    public preloadComponent(componentId: string): void {
        const componentData = this.componentTracker.getTrackedComponents().find(c => c.id === componentId);
        if (componentData) {
            const componentCache = new Map<string, any>(); 
            componentCache.set(componentId, componentData);

            console.log(`Компонент ${componentData.id} типа ${componentData.type} предзагружен и сохранен в кэш.`);
        } else {
            console.warn(`Компонент с id '${componentId}' не найден для предзагрузки.`);
        }
    }
}

export default ComponentPreloader; 