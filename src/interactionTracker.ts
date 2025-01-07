import DatabaseManager from './databaseManager';
import ComponentTracker from './componentTracker';

const componentTracker = ComponentTracker.getInstance();

class InteractionTracker {
  private dbManager: DatabaseManager;
  private componentTracker: ComponentTracker;

  constructor(componentTracker: ComponentTracker) {
    this.dbManager = DatabaseManager.getInstance();
    this.componentTracker = componentTracker;
  }

  public trackInteraction(actionType: string): void {
    const componentId = this.componentTracker.getComponentByAction(actionType);
    if (!componentId) {
      console.warn(`Компонент для действия '${actionType}' не найден.`);
      return;
    }

    const interaction = {
      componentId,
      actionType,
      timestamp: Date.now(),
    };

    this.dbManager.saveInteraction(interaction);

    console.log('Interaction tracked:', interaction);
  }
}

export default InteractionTracker;
