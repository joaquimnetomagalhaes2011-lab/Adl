
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Music, 
  Search, Library, ListMusic, Settings as SettingsIcon,
  Plus, MoreVertical, Heart, Shuffle, Repeat, ChevronDown,
  Volume2, Trash2, X, ChevronLeft, PlusCircle
} from 'lucide-react';
import { musicDB } from './db';
import { Track, Playlist, PlayerMode, RepeatMode } from './types';

// Ícone de fone de ouvido padrão (Headphone Icon) - Único permitido como fallback
const HEADPHONE_ICON = 'https://cdn-icons-png.flaticon.com/512/651/651717.png';

const IconButton: React.FC<{ 
  icon: React.ReactNode; 
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>; 
  className?: string; 
  active?: boolean 
}> = ({ icon, onClick, className = "", active = false }) => (
  <button 
    onClick={(e) => {
      if (onClick) onClick(e);
    }}
    className={`p-2 rounded-full transition-all active:scale-95 ${active ? 'text-purple-500 bg-purple-500/10' : 'text-zinc-400 hover:text-white'} ${className}`}
  >
    {icon}
  </button>
);

const ProgressBar: React.FC<{
  current: number;
  total: number;
  onChange: (value: number) => void | Promise<void>;
  className?: string;
}> = ({ current, total, onChange, className = "" }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <div className={`relative w-full h-1 bg-zinc-800 rounded-full cursor-pointer group ${className}`}>
      <input
        type="range"
        min="0"
        max={total || 0}
        value={current || 0}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div 
        className="absolute top-0 left-0 h-full bg-purple-500 rounded-full transition-all"
        style={{ width: `${percentage}%` }}
      />
      <div 
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        style={{ left: `calc(${percentage}% - 6px)` }}
      />
    </div>
  );
};

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  
  const [currentQueue, setCurrentQueue] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeTab, setActiveTab] = useState<PlayerMode>('library');
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>(RepeatMode.None);
  const [searchTerm, setSearchTerm] = useState('');
  const [isReady, setIsReady] = useState(false);
  
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [showPlaylistPickerFor, setShowPlaylistPickerFor] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isAddingFromLibrary, setIsAddingFromLibrary] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const audioUrlRef = useRef<string | null>(null);
  
  // Ref para as funções de controle para evitar stale closures no ended e MediaSession
  const controlsRef = useRef({
    handleNext: () => {},
    handlePrev: () => {},
    togglePlay: () => {}
  });

  const currentTrack = currentTrackIndex !== null ? currentQueue[currentTrackIndex] : null;

  const toggleFavorite = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const updatedTrack = { ...track, isFavorite: !track.isFavorite };
    await musicDB.saveTrack(updatedTrack);
    setTracks(prev => prev.map(t => t.id === trackId ? updatedTrack : t));
    setCurrentQueue(prev => prev.map(t => t.id === trackId ? updatedTrack : t));
  };

  const handleNext = useCallback(() => {
    if (currentQueue.length === 0) return;
    
    // Se estiver no modo de repetir uma música, apenas reinicia ela
    if (repeat === RepeatMode.One) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => setIsPlaying(false));
        return;
    }

    let nextIndex;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * currentQueue.length);
    } else {
      nextIndex = currentTrackIndex !== null ? (currentTrackIndex + 1) : 0;
      
      // Chegou ao fim da lista
      if (nextIndex >= currentQueue.length) {
        if (repeat === RepeatMode.All) {
          nextIndex = 0;
        } else {
          setIsPlaying(false);
          return;
        }
      }
    }
    
    setCurrentTrackIndex(nextIndex);
    setIsPlaying(true);
  }, [currentQueue, currentTrackIndex, shuffle, repeat]);

  const handlePrev = useCallback(() => {
    if (currentQueue.length === 0) return;
    let prevIndex = currentTrackIndex !== null ? (currentTrackIndex - 1 + currentQueue.length) % currentQueue.length : 0;
    setCurrentTrackIndex(prevIndex);
    setIsPlaying(true);
  }, [currentQueue, currentTrackIndex]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Sincroniza refs para uso em eventos externos (Audio.ended / MediaSession)
  useEffect(() => {
    controlsRef.current = { handleNext, handlePrev, togglePlay };
  }, [handleNext, handlePrev, togglePlay]);

  useEffect(() => {
    const init = async () => {
      await musicDB.init();
      const storedTracks = await musicDB.getAllTracks();
      const storedPlaylists = await musicDB.getPlaylists();
      const lastShuffle = await musicDB.getSetting('shuffle');
      const lastRepeat = await musicDB.getSetting('repeat');

      setTracks(storedTracks);
      setPlaylists(storedPlaylists);
      setCurrentQueue(storedTracks);
      
      const lastIndex = await musicDB.getSetting('lastTrackIndex');
      if (typeof lastIndex === 'number' && storedTracks[lastIndex]) {
        setCurrentTrackIndex(lastIndex);
      }
      
      if (lastShuffle !== null) setShuffle(lastShuffle);
      if (lastRepeat !== null) setRepeat(lastRepeat);
      
      // Configuração inicial do Audio Object para Background
      const audio = audioRef.current;
      audio.preload = "auto";
      
      const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
      const handleEnded = () => controlsRef.current.handleNext();
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      
      setIsReady(true);

      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
      };
    };
    init();
  }, []);

  // Sincronização do Media Session (Notificações do Sistema / Background)
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      const coverArt = currentTrack.coverUrl || HEADPHONE_ICON;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'VibePlayer',
        artwork: [
          { src: coverArt, sizes: '96x96', type: 'image/png' },
          { src: coverArt, sizes: '128x128', type: 'image/png' },
          { src: coverArt, sizes: '192x192', type: 'image/png' },
          { src: coverArt, sizes: '256x256', type: 'image/png' },
          { src: coverArt, sizes: '384x384', type: 'image/png' },
          { src: coverArt, sizes: '512x512', type: 'image/png' },
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => controlsRef.current.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => controlsRef.current.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => controlsRef.current.handlePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => controlsRef.current.handleNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && audioRef.current) {
          audioRef.current.currentTime = details.seekTime;
        }
      });
    }
  }, [currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
    
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Carrega a música quando o index muda
  useEffect(() => {
    if (currentTrackIndex !== null && currentQueue[currentTrackIndex]) {
      const track = currentQueue[currentTrackIndex];
      const audio = audioRef.current;
      
      // Limpa URL anterior para evitar vazamento de memória
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      const url = URL.createObjectURL(track.blob);
      audioUrlRef.current = url;
      audio.src = url;
      audio.load();

      if (isPlaying) {
        audio.play().catch(() => setIsPlaying(false));
      }
      
      musicDB.saveSetting('lastTrackIndex', currentTrackIndex);
    }
  }, [currentTrackIndex, currentQueue]);

  // Salva configurações de modo de player
  useEffect(() => {
    if (isReady) {
      musicDB.saveSetting('shuffle', shuffle);
      musicDB.saveSetting('repeat', repeat);
    }
  }, [shuffle, repeat, isReady]);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newTracksBatch: Track[] = [];
    
    const getMetadata = (file: File): Promise<Partial<Track>> => {
      return new Promise((resolve) => {
        // @ts-ignore
        if (!window.jsmediatags) {
            resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Desconhecido' });
            return;
        }
        // @ts-ignore
        window.jsmediatags.read(file, {
          onSuccess: (tag: any) => {
            let coverUrl = '';
            try {
                if (tag && tag.tags && tag.tags.picture && tag.tags.picture.data) {
                    const { data, format } = tag.tags.picture;
                    const uint8Data = new Uint8Array(data);
                    let base64String = "";
                    for (let i = 0; i < uint8Data.length; i++) {
                        base64String += String.fromCharCode(uint8Data[i]);
                    }
                    coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
                }
            } catch (err) {}
            resolve({
              title: (tag && tag.tags && tag.tags.title) || file.name.replace(/\.[^/.]+$/, ""),
              artist: (tag && tag.tags && tag.tags.artist) || 'Desconhecido',
              album: (tag && tag.tags && tag.tags.album) || 'VibePlayer',
              coverUrl
            });
          },
          onError: () => resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Desconhecido' })
        });
      });
    };

    const getDuration = (file: File): Promise<number> => {
        return new Promise((resolve) => {
            const audio = new Audio();
            const url = URL.createObjectURL(file);
            const timeout = setTimeout(() => { URL.revokeObjectURL(url); resolve(0); }, 5000);
            audio.onloadedmetadata = () => { clearTimeout(timeout); resolve(audio.duration); URL.revokeObjectURL(url); };
            audio.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(url); resolve(0); };
            audio.src = url;
        });
    };

    for (const file of Array.from(files) as File[]) {
      if (!file.type.startsWith('audio/')) continue;
      try {
          const [tags, duration] = await Promise.all([ getMetadata(file), getDuration(file) ]);
          const track: Track = {
            id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + Math.random()).toString(36),
            title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
            artist: tags.artist || 'Desconhecido',
            album: tags.album,
            coverUrl: tags.coverUrl,
            duration: duration || 0,
            blob: file,
            addedAt: Date.now(),
            isFavorite: false
          };
          await musicDB.saveTrack(track);
          newTracksBatch.push(track);
      } catch (err) {}
    }
    if (newTracksBatch.length > 0) {
        setTracks(prev => {
            const updated = [...prev, ...newTracksBatch];
            if (activeTab === 'library') setCurrentQueue(updated);
            return updated;
        });
    }
    e.target.value = '';
  };

  const removeTrack = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await musicDB.deleteTrack(id);
    setTracks(prev => prev.filter(t => t.id !== id));
    setCurrentQueue(prev => prev.filter(t => t.id !== id));
    const updatedPlaylists = playlists.map(p => ({ ...p, trackIds: p.trackIds.filter(tid => tid !== id) }));
    setPlaylists(updatedPlaylists);
    for (const p of updatedPlaylists) await musicDB.savePlaylist(p);
    if (currentTrack?.id === id) {
      setIsPlaying(false);
      setCurrentTrackIndex(null);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const newPlaylist: Playlist = {
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + Math.random()).toString(36),
        name: newPlaylistName.trim(),
        trackIds: [],
        createdAt: Date.now()
    };
    await musicDB.savePlaylist(newPlaylist);
    setPlaylists(prev => [...prev, newPlaylist]);
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
  };

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    if (playlist.trackIds.includes(trackId)) return;
    const updatedPlaylist = { ...playlist, trackIds: [...playlist.trackIds, trackId] };
    await musicDB.savePlaylist(updatedPlaylist);
    setPlaylists(prev => prev.map(p => p.id === playlistId ? updatedPlaylist : p));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isReady) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950">
      <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const filteredTracks = tracks.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activePlaylist = selectedPlaylistId ? playlists.find(p => p.id === selectedPlaylistId) : null;
  const activePlaylistTracks = activePlaylist ? activePlaylist.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[] : [];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-950 safe-bottom">
      {/* Modal: Adicionar da Biblioteca */}
      {isAddingFromLibrary && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col animate-[slideUp_0.3s_ease-out]">
          <header className="p-4 flex items-center gap-4 border-b border-zinc-800">
            <IconButton icon={<ChevronLeft size={24} />} onClick={() => setIsAddingFromLibrary(null)} />
            <h3 className="text-lg font-bold">Biblioteca Local</h3>
          </header>
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
            <div className="space-y-2">
              {tracks.filter(t => {
                const p = playlists.find(pl => pl.id === isAddingFromLibrary);
                return p ? !p.trackIds.includes(t.id) : true;
              }).map(track => (
                <div key={track.id} onClick={() => addTrackToPlaylist(isAddingFromLibrary, track.id)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900 active:border-purple-500/50 transition-all border border-transparent">
                  <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0">
                    {track.coverUrl ? <img src={track.coverUrl} className="w-full h-full object-cover" /> : <img src={HEADPHONE_ICON} className="w-full h-full object-contain p-2" />}
                  </div>
                  <div className="flex-1 min-w-0"><h4 className="text-sm font-medium truncate">{track.title}</h4><p className="text-xs text-zinc-500 truncate">{track.artist}</p></div>
                  <IconButton icon={<PlusCircle size={20} className="text-purple-500" />} />
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 border-t border-zinc-900"><button onClick={() => setIsAddingFromLibrary(null)} className="w-full py-4 bg-purple-500 rounded-2xl font-bold">Concluído</button></div>
        </div>
      )}

      {isCreatingPlaylist && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-xs bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">Nova Playlist</h3>
            <input autoFocus type="text" placeholder="Nome..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()} className="w-full bg-zinc-800 border-none rounded-xl py-3 px-4 text-white outline-none focus:ring-2 focus:ring-purple-500 mb-6" />
            <div className="flex gap-3"><button onClick={() => setIsCreatingPlaylist(false)} className="flex-1 py-3 rounded-xl bg-zinc-800 font-medium">Cancelar</button><button onClick={handleCreatePlaylist} className="flex-1 py-3 rounded-xl bg-purple-500 font-bold">Criar</button></div>
          </div>
        </div>
      )}

      {/* Modal: Seletor rápido de playlist */}
      {showPlaylistPickerFor && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-800 animate-[slideUp_0.2s_ease-out]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold">Adicionar à Playlist</h3>
                    <IconButton icon={<X size={20} />} onClick={() => setShowPlaylistPickerFor(null)} />
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                    {playlists.map(p => (
                        <button key={p.id} onClick={() => { addTrackToPlaylist(p.id, showPlaylistPickerFor); setShowPlaylistPickerFor(null); }} className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800 rounded-xl transition-colors text-left">
                            <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-purple-500">
                                <ListMusic size={18} />
                            </div>
                            <span className="font-medium">{p.name}</span>
                        </button>
                    ))}
                </div>
                <button onClick={() => { setShowPlaylistPickerFor(null); setIsCreatingPlaylist(true); }} className="w-full mt-6 py-3 bg-purple-500 hover:bg-purple-600 rounded-xl font-bold transition-colors">
                    Criar Nova Playlist
                </button>
            </div>
        </div>
      )}

      <header className="p-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950 z-50">
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-fuchsia-500 bg-clip-text text-transparent">VibePlayer</h1>
        <div className="flex gap-2">
          <IconButton icon={<Search size={20} />} active={activeTab === 'search'} onClick={() => setActiveTab('search')} />
          <IconButton icon={<SettingsIcon size={20} />} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar p-4 pb-64">
        {activeTab === 'search' && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input type="text" placeholder="Buscar música ou artista..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-zinc-900 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
          </div>
        )}

        {(activeTab === 'library' || activeTab === 'search') ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Biblioteca Local ({filteredTracks.length})</h2>
              <label className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-full cursor-pointer hover:bg-purple-500/20 transition-colors">
                <Plus size={14} /><span>Importar</span><input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileImport} />
              </label>
            </div>
            
            {filteredTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-600 animate-pulse">
                <Music size={48} className="mb-4 opacity-20" />
                <p className="font-medium">Biblioteca vazia</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTracks.map((track) => (
                  <div key={track.id} onClick={() => { setCurrentQueue(filteredTracks); setCurrentTrackIndex(filteredTracks.findIndex(t => t.id === track.id)); setIsPlaying(true); }} className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${currentTrack?.id === track.id ? 'bg-zinc-900/50' : 'hover:bg-zinc-900/30'}`}>
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 relative">
                      {track.coverUrl ? <img src={track.coverUrl} className="w-full h-full object-cover" /> : <img src={HEADPHONE_ICON} className="w-full h-full object-contain p-2" />}
                      {currentTrack?.id === track.id && isPlaying && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="flex gap-0.5 items-end h-3"><div className="w-0.5 h-full bg-purple-500 animate-bounce"></div><div className="w-0.5 h-1/2 bg-purple-500 animate-bounce delay-75"></div><div className="w-0.5 h-3/4 bg-purple-500 animate-bounce delay-150"></div></div></div>}
                    </div>
                    <div className="flex-1 min-w-0"><h3 className={`text-sm font-medium truncate ${currentTrack?.id === track.id ? 'text-purple-400' : 'text-zinc-200'}`}>{track.title}</h3><p className="text-xs text-zinc-500 truncate">{track.artist}</p></div>
                    <div className="flex items-center gap-1">
                      <IconButton icon={<Heart size={14} className={track.isFavorite ? "text-red-500 fill-red-500" : ""} />} onClick={(e) => { e.stopPropagation(); toggleFavorite(track.id); }} />
                      <IconButton icon={<Plus size={14} />} onClick={(e) => { e.stopPropagation(); setShowPlaylistPickerFor(track.id); }} />
                      <IconButton icon={<Trash2 size={14} className="hover:text-red-400" />} onClick={(e) => removeTrack(track.id, e)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'playlists' ? (
          <div>
            {selectedPlaylistId && activePlaylist ? (
              <div>
                <div className="flex items-center gap-3 mb-6"><IconButton icon={<ChevronLeft size={24} />} onClick={() => setSelectedPlaylistId(null)} /><h2 className="text-2xl font-bold truncate flex-1">{activePlaylist.name}</h2><IconButton icon={<Trash2 size={20} className="text-red-500" onClick={() => musicDB.deletePlaylist(activePlaylist.id).then(() => { setPlaylists(p => p.filter(x => x.id !== activePlaylist.id)); setSelectedPlaylistId(null); })} />} /></div>
                
                <button 
                  onClick={() => { setCurrentQueue(activePlaylistTracks); setCurrentTrackIndex(0); setIsPlaying(true); }} 
                  disabled={activePlaylistTracks.length === 0}
                  className="w-full mb-6 py-4 bg-purple-500 disabled:opacity-30 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                  <Play size={20} fill="white" /> Reproduzir Tudo
                </button>

                {activePlaylistTracks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <p className="text-zinc-500 font-medium">Playlist vazia</p>
                    <button onClick={() => setIsAddingFromLibrary(activePlaylist.id)} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-6 py-3 rounded-xl text-purple-400 font-bold hover:bg-zinc-800 transition-all">
                      <PlusCircle size={20} />
                      <span>Adicionar da Biblioteca</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {activePlaylistTracks.map(track => (
                      <div key={track.id} onClick={() => { setCurrentQueue(activePlaylistTracks); setCurrentTrackIndex(activePlaylistTracks.indexOf(track)); setIsPlaying(true); }} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900/30 transition-all">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800">{track.coverUrl ? <img src={track.coverUrl} className="w-full h-full object-cover" /> : <img src={HEADPHONE_ICON} className="w-full h-full object-contain p-2" />}</div>
                        <div className="flex-1 min-w-0"><h4 className="text-sm font-medium truncate">{track.title}</h4><p className="text-xs text-zinc-500 truncate">{track.artist}</p></div>
                        <IconButton icon={<X size={14} className="hover:text-red-400" />} onClick={(e) => addTrackToPlaylist(activePlaylist.id, track.id)} />
                      </div>
                    ))}
                    <div onClick={() => setIsAddingFromLibrary(activePlaylist.id)} className="flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-zinc-800 mt-4 text-purple-400 font-bold cursor-pointer hover:bg-zinc-900/20 transition-all">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center"><Plus size={20} /></div>
                      <span>Adicionar mais músicas</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6"><h2 className="text-xl font-bold">Playlists</h2><IconButton icon={<Plus size={24} />} className="bg-purple-500 text-white shadow-lg" onClick={() => setIsCreatingPlaylist(true)} /></div>
                <div className="grid grid-cols-2 gap-4">
                  {playlists.map(p => (
                    <div key={p.id} onClick={() => setSelectedPlaylistId(p.id)} className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-900 hover:border-purple-500/50 transition-all">
                      <div className="w-full aspect-square bg-zinc-800 rounded-xl mb-3 overflow-hidden flex items-center justify-center text-purple-500/30 shadow-inner">
                        {p.trackIds.length > 0 && tracks.find(t => t.id === p.trackIds[0])?.coverUrl ? <img src={tracks.find(t => t.id === p.trackIds[0])?.coverUrl} className="w-full h-full object-cover" /> : <ListMusic size={40} />}
                      </div>
                      <h3 className="font-bold truncate text-sm">{p.name}</h3><p className="text-[10px] text-zinc-500">{p.trackIds.length} Músicas</p>
                    </div>
                  ))}
                  {playlists.length === 0 && <div className="col-span-2 py-20 text-center text-zinc-600 font-medium">Nenhuma playlist criada.</div>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-zinc-900/30 rounded-3xl border border-zinc-900 shadow-xl">
              <h3 className="text-sm font-bold mb-4 text-purple-400 uppercase tracking-widest">Configurações</h3>
              <div className="space-y-1">
                <p className="text-xs text-zinc-200 font-medium">VibePlayer v1.1.2</p>
                <p className="text-[10px] text-zinc-500">Reprodutor Avançado - Estabilidade Background Full</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MINI PLAYER */}
      {currentTrack && (
        <div onClick={() => setIsFullScreen(true)} className="fixed bottom-[76px] left-4 right-4 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl p-2.5 flex items-center gap-3 shadow-2xl z-40 transition-all active:scale-[0.98]">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden shadow-lg">
            {currentTrack.coverUrl ? <img src={currentTrack.coverUrl} className="w-full h-full object-cover" /> : <img src={HEADPHONE_ICON} className="w-full h-full object-contain p-2" />}
          </div>
          <div className="flex-1 min-w-0"><h4 className="text-xs font-semibold truncate text-zinc-200">{currentTrack.title}</h4><p className="text-[10px] text-zinc-500 truncate">{currentTrack.artist}</p></div>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <IconButton icon={<SkipBack size={18} fill="currentColor" />} onClick={handlePrev} />
            <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black active:scale-90 transition-transform shadow-md">{isPlaying ? <Pause size={18} fill="black" /> : <Play size={18} fill="black" className="ml-0.5" />}</button>
            <IconButton icon={<SkipForward size={18} fill="currentColor" />} onClick={handleNext} />
          </div>
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500 transition-all duration-300 shadow-[0_0_8px_rgba(168,85,247,0.5)]" style={{ width: `${(currentTime / (currentTrack.duration || 1)) * 100}%` }} /></div>
        </div>
      )}

      {/* NAV BAR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-900 flex justify-around p-3 pb-safe z-50">
        <button onClick={() => { setActiveTab('library'); setSelectedPlaylistId(null); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'library' ? 'text-purple-500 font-bold' : 'text-zinc-500'}`}><Library size={20} /><span className="text-[10px]">Biblioteca</span></button>
        <button onClick={() => { setActiveTab('playlists'); setSelectedPlaylistId(null); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'playlists' ? 'text-purple-500 font-bold' : 'text-zinc-500'}`}><ListMusic size={20} /><span className="text-[10px]">Playlists</span></button>
        <button onClick={() => { setActiveTab('search'); setSelectedPlaylistId(null); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'search' ? 'text-purple-500 font-bold' : 'text-zinc-500'}`}><Search size={20} /><span className="text-[10px]">Busca</span></button>
      </nav>

      {/* FULL SCREEN PLAYER */}
      {isFullScreen && currentTrack && (
        <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col p-6 overflow-hidden animate-[slideUp_0.4s_ease-out]">
          <div className="flex justify-between items-center mb-10">
            <IconButton icon={<ChevronDown size={28} />} onClick={() => setIsFullScreen(false)} />
            <div className="text-center flex-1 min-w-0 px-4">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.2em] mb-1 block">Tocando</span>
              <p className="text-xs text-zinc-400 truncate font-medium">{currentTrack.album || currentTrack.title}</p>
            </div>
            <IconButton icon={<MoreVertical size={20} />} />
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center mb-8">
            <div className="w-full aspect-square rounded-[2rem] bg-zinc-900 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden mb-10 max-w-[320px] transform transition-transform duration-500 hover:scale-105">
              {currentTrack.coverUrl ? <img src={currentTrack.coverUrl} className="w-full h-full object-cover" /> : <img src={HEADPHONE_ICON} className="w-full h-full object-contain p-2" />}
            </div>
            
            <div className="w-full flex justify-between items-end mb-6">
              <div className="flex-1 min-w-0 pr-6">
                <h2 className="text-2xl font-bold truncate mb-1 text-white">{currentTrack.title}</h2>
                <p className="text-purple-400 text-lg truncate font-medium opacity-90">{currentTrack.artist}</p>
              </div>
              <IconButton icon={<Heart size={26} className={currentTrack.isFavorite ? "text-red-500 fill-red-500" : "text-zinc-500"} onClick={() => toggleFavorite(currentTrack.id)} />} />
            </div>
            
            <div className="w-full space-y-3">
              <ProgressBar current={currentTime} total={currentTrack.duration} onChange={(v) => { if(audioRef.current) audioRef.current.currentTime = v; }} />
              <div className="flex justify-between text-[11px] text-zinc-500 font-bold tracking-tighter opacity-70">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(currentTrack.duration)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-10 pb-10">
            <div className="flex justify-between items-center px-4">
              <IconButton icon={<Shuffle size={22} />} active={shuffle} onClick={() => setShuffle(!shuffle)} />
              <div className="flex items-center gap-8">
                <IconButton icon={<SkipBack size={36} fill="currentColor" onClick={handlePrev} />} />
                <button onClick={() => setIsPlaying(!isPlaying)} className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-black shadow-[0_8px_25px_rgba(255,255,255,0.2)] active:scale-90 transition-all">
                  {isPlaying ? <Pause size={38} fill="black" /> : <Play size={38} fill="black" className="ml-1" />}
                </button>
                <IconButton icon={<SkipForward size={36} fill="currentColor" onClick={handleNext} />} />
              </div>
              <IconButton icon={<Repeat size={22} />} active={repeat !== RepeatMode.None} onClick={() => { 
                const modes = [RepeatMode.None, RepeatMode.All, RepeatMode.One]; 
                setRepeat(modes[(modes.indexOf(repeat) + 1) % modes.length]); 
              }} />
            </div>
            
            <div className="flex justify-center items-center gap-14 text-zinc-600 opacity-60">
              <IconButton icon={<Volume2 size={20} />} />
              <IconButton icon={<ListMusic size={20} onClick={() => { setIsFullScreen(false); setActiveTab('playlists'); }} />} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}
