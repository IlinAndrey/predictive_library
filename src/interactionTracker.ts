// src/interactionTracker.ts
import DatabaseManager from './databaseManager';

class InteractionTracker {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  public trackInteraction(componentId: string, actionType: string): void {
    const interaction = {
      componentId,
      actionType,
      timestamp: Date.now(),
    };

    // Log interaction to IndexedDB
    this.dbManager.saveInteraction(interaction);

    console.log('Interaction tracked:', interaction);
  }
}

export default InteractionTracker;
