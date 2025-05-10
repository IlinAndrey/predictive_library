export interface InteractionRecord {
  componentId: string;
  actionType: string;
  timestamp: number;
}

type InteractionCallback = (interaction: InteractionRecord) => void;

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

  private initializeDatabase(): void {
    const request = indexedDB.open(this.dbName, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(this.storeName)) {
        const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        store.createIndex('componentId', 'componentId', { unique: false });
      }
    };

    request.onerror = () => {
      console.error('Error initializing IndexedDB');
    };

    request.onsuccess = () => {
      console.log('IndexedDB initialized successfully');
    };
  }

  public async saveInteraction(interaction: InteractionRecord): Promise<void> {
    const encryptedActionType = await this.encrypt(interaction.actionType);
    const encryptedComponentId = await this.encrypt(interaction.componentId);
    const encryptedInteraction = {
      actionType: encryptedActionType.ciphertext,
      actionTypeIV: encryptedActionType.iv,
      componentId: encryptedComponentId.ciphertext,
      componentIdIV: encryptedComponentId.iv,
      timestamp: interaction.timestamp,
    };

    const request = indexedDB.open(this.dbName);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);

        store.add(encryptedInteraction);

        transaction.oncomplete = () => {
          console.log('Encrypted interaction saved to IndexedDB:', encryptedInteraction);
          this.notifyInteractionSaved(interaction);
          resolve();
        };

        transaction.onerror = () => {
          console.error('Error saving interaction to IndexedDB');
          reject('Error saving interaction');
        };
      };

      request.onerror = () => {
        console.error('Error opening IndexedDB for saving interaction');
        reject('Error opening IndexedDB');
      };
    });
  }

  private notifyInteractionSaved(interaction: InteractionRecord): void {
    this.interactionSavedCallbacks.forEach((callback) => callback(interaction));
  }

  public onInteractionSaved(callback: InteractionCallback): void {
    this.interactionSavedCallbacks.push(callback);
  }

  public async getAllInteractions(): Promise<InteractionRecord[]> {
    return new Promise(async (resolve, reject) => {
      const request = indexedDB.open(this.dbName);

      request.onsuccess = async () => {
        const db = request.result;
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.getAll();

        getRequest.onsuccess = async () => {
          const encryptedRecords = getRequest.result as any[];
          const decryptedRecords: InteractionRecord[] = [];

          for (const record of encryptedRecords) {
            const decryptedActionType = await this.decrypt(record.actionType, record.actionTypeIV);
            const decryptedComponentId = await this.decrypt(record.componentId, record.componentIdIV);
            decryptedRecords.push({
              actionType: decryptedActionType,
              componentId: decryptedComponentId,
              timestamp: record.timestamp,
            });
          }

          resolve(decryptedRecords);
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

  public async getComponentData(componentId: string): Promise<InteractionRecord | null> {
    const encryptedComponentId = await this.encrypt(componentId);
    return new Promise(async (resolve, reject) => {
      const request = indexedDB.open(this.dbName);

      request.onsuccess = async () => {
        const db = request.result;
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.getAll();

        getRequest.onsuccess = async () => {
          const encryptedRecords = getRequest.result as any[];
          for (const record of encryptedRecords) {
            const decryptedComponentId = await this.decrypt(record.componentId, record.componentIdIV);
            if (decryptedComponentId === componentId) {
              const decryptedActionType = await this.decrypt(record.actionType, record.actionTypeIV);
              resolve({
                actionType: decryptedActionType,
                componentId: decryptedComponentId,
                timestamp: record.timestamp
              });
              return;
            }
          }
          resolve(null);
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