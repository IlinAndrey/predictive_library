// src/componentTracker.ts

interface ComponentData {
    id: string; // Unique identifier for the component
    type: string; // Type of the component, e.g., 'button', 'page', etc.
    metadata?: Record<string, any>; // Optional additional data
}

type CallbackFunction = (component: ComponentData) => void;

class ComponentTracker {
    private trackedComponents: Map<string, ComponentData>;
    private onTrackCallback?: CallbackFunction;

    constructor() {
        this.trackedComponents = new Map();
    }

    /**
     * Tracks a component by its ID and type. Optionally, metadata can be provided.
     * @param id Unique identifier of the component.
     * @param type Type of the component, e.g., 'button', 'page', etc.
     * @param metadata Optional additional data about the component.
     */
    trackComponent(id: string, type: string, metadata?: Record<string, any>): void {
        if (this.trackedComponents.has(id)) {
            console.warn(`Component with id '${id}' is already being tracked.`);
            return;
        }

        const componentData: ComponentData = { id, type, metadata };
        this.trackedComponents.set(id, componentData);

        if (this.onTrackCallback) {
            this.onTrackCallback(componentData);
        }

        console.log(`Component '${id}' of type '${type}' has been tracked.`);
    }

    /**
     * Sets a callback function to be executed whenever a component is tracked.
     * @param callback Function to execute when a component is tracked.
     */
    setOnTrackCallback(callback: CallbackFunction): void {
        this.onTrackCallback = callback;
    }

    /**
     * Returns all currently tracked components.
     */
    getTrackedComponents(): ComponentData[] {
        return Array.from(this.trackedComponents.values());
    }

    /**
     * Stops tracking a component by its ID.
     * @param id Unique identifier of the component to stop tracking.
     */
    untrackComponent(id: string): void {
        if (this.trackedComponents.delete(id)) {
            console.log(`Component '${id}' has been untracked.`);
        } else {
            console.warn(`Component with id '${id}' is not being tracked.`);
        }
    }
}

export default ComponentTracker;