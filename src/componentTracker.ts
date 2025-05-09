//componentTracker.ts
interface ComponentData {
    id: string;
    type: string;
    metadata?: Record<string, any>;
}

type CallbackFunction = (component: ComponentData) => void;

class ComponentTracker {
    private static instance: ComponentTracker;
    private trackedComponents: Map<string, ComponentData>;
    private actionComponentMap: Map<string, string>;

    private constructor() {
        this.trackedComponents = new Map();
        this.actionComponentMap = new Map();
    }

    public static getInstance(): ComponentTracker {
        if (!ComponentTracker.instance) {
            ComponentTracker.instance = new ComponentTracker();
        }
        return ComponentTracker.instance;
    }

    public trackComponent(id: string, type: string, metadata?: Record<string, any>): void {
        if (this.trackedComponents.has(id)) {
            console.warn(`Component with id '${id}' is already being tracked.`);
            return;
        }

        const componentData: ComponentData = { id, type, metadata };
        this.trackedComponents.set(id, componentData);
        console.log(`Component '${id}' of type '${type}' has been tracked.`);
    }

    public associateActionWithComponent(actionType: string, componentId: string): void {
        if (!this.trackedComponents.has(componentId)) {
            console.warn(`Компонент с id '${componentId}' не отслеживается.`);
            return;
        }

        this.actionComponentMap.set(actionType, componentId);
        console.log(`Действие '${actionType}' связано с компонентом '${componentId}'.`);
    }

    public getComponentByAction(actionType: string): string | null {
        const componentId = this.actionComponentMap.get(actionType) || null;
        console.log(`Получен компонент для действия '${actionType}': ${componentId}`);
        return componentId;
    }

    public getTrackedComponents() {
        return Array.from(this.trackedComponents.values());
    }
}

export default ComponentTracker;