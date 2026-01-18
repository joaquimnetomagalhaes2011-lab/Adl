
import { Track, Playlist } from './types';

const DB_NAME = 'VibePlayerDB';
const DB_VERSION = 2;
const TRACKS_STORE = 'tracks';
const PLAYLISTS_STORE = 'playlists';
const SETTINGS_STORE = 'settings';

export class MusicDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(TRACKS_STORE)) {
          db.createObjectStore(TRACKS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
          db.createObjectStore(PLAYLISTS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject('Failed to open IndexedDB');
    });
  }

  private getStore(name: string, mode: IDBTransactionMode) {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.transaction(name, mode).objectStore(name);
  }

  async saveTrack(track: Track): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(TRACKS_STORE, 'readwrite');
      const request = store.put(track);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error saving track');
    });
  }

  async getAllTracks(): Promise<Track[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(TRACKS_STORE, 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Error fetching tracks');
    });
  }

  async deleteTrack(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(TRACKS_STORE, 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error deleting track');
    });
  }

  async savePlaylist(playlist: Playlist): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(PLAYLISTS_STORE, 'readwrite');
      const request = store.put(playlist);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error saving playlist');
    });
  }

  async getPlaylists(): Promise<Playlist[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(PLAYLISTS_STORE, 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Error fetching playlists');
    });
  }

  async deletePlaylist(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(PLAYLISTS_STORE, 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error deleting playlist');
    });
  }

  async saveSetting(key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(SETTINGS_STORE, 'readwrite');
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error saving setting');
    });
  }

  async getSetting(key: string): Promise<any> {
    return new Promise((resolve) => {
      const store = this.getStore(SETTINGS_STORE, 'readonly');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }
}

export const musicDB = new MusicDB();
