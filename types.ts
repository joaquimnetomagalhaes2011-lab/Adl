
export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  blob: Blob;
  coverUrl?: string;
  addedAt: number;
  isFavorite?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export type PlayerMode = 'library' | 'playlists' | 'settings' | 'search';

export enum RepeatMode {
  None = 'none',
  One = 'one',
  All = 'all'
}
