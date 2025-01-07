// src/databaseManager.ts
export interface InteractionRecord {
  componentId: string;
  actionType: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

type InteractionCallback = (interaction: InteractionRecord) => void;

class DatabaseManager {
  private static instance: DatabaseManager;
  private dbName: string;
  private storeName: string;
  private interactionSavedCallbacks: InteractionCallback[];

  private constructor(dbName = 'PredictLibraryDB', storeName = 'Interactions') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.interactionSavedCallbacks = [];
    this.initializeDatabase();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private initializeDatabase(): void {
    const request = indexedDB.open(this.dbName, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(this.storeName)) {
        db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onerror = () => {
      console.error('Error initializing IndexedDB');
    };

    request.onsuccess = () => {
      console.log('IndexedDB initialized successfully');
    };
  }

  public saveInteraction(interaction: InteractionRecord): void {
    const request = indexedDB.open(this.dbName);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      store.add(interaction);

      transaction.oncomplete = () => {
        console.log('Interaction saved to IndexedDB:', interaction);
        this.notifyInteractionSaved(interaction);
      };

      transaction.onerror = () => {
        console.error('Error saving interaction to IndexedDB');
      };
    };

    request.onerror = () => {
      console.error('Error opening IndexedDB for saving interaction');
    };
  }

  private notifyInteractionSaved(interaction: InteractionRecord): void {
    this.interactionSavedCallbacks.forEach((callback) => callback(interaction));
  }

  public onInteractionSaved(callback: InteractionCallback): void {
    this.interactionSavedCallbacks.push(callback);
  }

  public getAllInteractions(): Promise<InteractionRecord[]> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.getAll();

        getRequest.onsuccess = () => {
          resolve(getRequest.result as InteractionRecord[]);
        };

        getRequest.onerror = () => {
          reject('Error retrieving interactions from IndexedDB');
        };
      };

      request.onerror = () => {
        reject('Error opening IndexedDB for retrieving interactions');
      };
    });
  }

  public clearInteractions(): void {
    const request = indexedDB.open(this.dbName);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      store.clear();

      transaction.oncomplete = () => {
        console.log('All interactions cleared from IndexedDB');
      };

      transaction.onerror = () => {
        console.error('Error clearing interactions from IndexedDB');
      };
    };

    request.onerror = () => {
      console.error('Error opening IndexedDB for clearing interactions');
    };
  }

  public getComponentData(componentId: string): Promise<InteractionRecord | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.index('componentId').get(componentId);

        getRequest.onsuccess = () => {
          resolve(getRequest.result || null);
        };

        getRequest.onerror = () => {
          reject('Error retrieving component data from IndexedDB');
        };
      };

      request.onerror = () => {
        reject('Error opening IndexedDB for retrieving component data');
      };
    });
  }

}

DatabaseManager.getInstance();

export default DatabaseManager;
