
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Music, 
  Search, Library, ListMusic, Settings as SettingsIcon,
  Plus, MoreVertical, Heart, Shuffle, Repeat, ChevronDown,
  Volume2, Trash2, X, ChevronLeft, PlusCircle
} from 'lucide-react';
import { musicDB } from './db';
import { Track, Playlist, PlayerMode, RepeatMode } from './types';

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

// Componente de Capa com Inicial como Placeholder (Estilizado)
const TrackCover: React.FC<{ track: Track; size?: 'sm' | 'md' | 'lg' }> = ({ track, size = 'md' }) => {
  const initial = track.title.charAt(0).toUpperCase();
  
  const sizeClasses = {
    sm: 'w-10 h-10 text-sm rounded-lg',
    md: 'w-12 h-12 text-base rounded-xl',
    lg: 'w-full aspect-square text-6xl rounded-[2.5rem]'
  };

  if (track.coverUrl) {
    return (
      <div className={`${sizeClasses[size]} overflow-hidden flex-shrink-0 bg-zinc-800 shadow-lg`}>
        <img src={track.coverUrl} className="w-full h-full object-cover" />
      </div>
    );
  }

  // Placeholder com degradê neon e a inicial do nome
  return (
    <div className={`${sizeClasses[size]} flex-shrink-0 bg-gradient-to-br from-purple-600 to-fuchsia-700 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/10`}>
      {initial}
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
  const lastTrackId = useRef<string | null>(null);
  
  const controlsRef = useRef({ handleNext: () => {}, handlePrev: () => {}, togglePlay: () => {} });

  const currentTrack = currentTrackIndex !== null ? currentQueue[currentTrackIndex] : null;

  const handleNext = useCallback(() => {
    if (currentQueue.length === 0) return;
    if (repeat === RepeatMode.One) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
        return;
    }
    let nextIndex;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * currentQueue.length);
    } else {
      nextIndex = currentTrackIndex !== null ? (currentTrackIndex + 1) : 0;
      if (nextIndex >= currentQueue.length) {
        if (repeat === RepeatMode.All) nextIndex = 0;
        else { setIsPlaying(false); return; }
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

  // Efeito de carregar a música - Corrigido para evitar "tocando e parando"
  useEffect(() => {
    if (currentTrack && currentTrack.id !== lastTrackId.current) {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(currentTrack.blob);
      audioUrlRef.current = url;
      audioRef.current.src = url;
      audioRef.current.load();
      lastTrackId.current = currentTrack.id;
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      }
      musicDB.saveSetting('lastTrackIndex', currentTrackIndex);
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      const coverArt = currentTrack.coverUrl || HEADPHONE_ICON;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork: [{ src: coverArt, sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', () => controlsRef.current.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => controlsRef.current.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => controlsRef.current.handlePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => controlsRef.current.handleNext());
    }
  }, [currentTrack]);

  useEffect(() => {
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newTracksBatch: Track[] = [];
    
    const getMetadata = (file: File): Promise<Partial<Track>> => {
      return new Promise((resolve) => {
        // @ts-ignore
        if (!window.jsmediatags) { resolve({ title: file.name.replace(/\.[^/.]+$/, "") }); return; }
        // @ts-ignore
        window.jsmediatags.read(file, {
          onSuccess: (tag: any) => {
            let coverUrl = '';
            try {
                if (tag?.tags?.picture) {
                    const { data, format } = tag.tags.picture;
                    let binary = '';
                    const bytes = new Uint8Array(data);
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    coverUrl = `data:${format};base64,${btoa(binary)}`;
                }
            } catch (err) {}
            resolve({
              title: tag?.tags?.title || file.name.replace(/\.[^/.]+$/, ""),
              artist: tag?.tags?.artist || 'Desconhecido',
              album: tag?.tags?.album,
              coverUrl
            });
          },
          onError: () => resolve({ title: file.name.replace(/\.[^/.]+$/, "") })
        });
      });
    };

    // Fix: Explicitly cast Array.from(files) to File[] to resolve inference issues where 'file' becomes 'unknown'
    for (const file of Array.from(files) as File[]) {
      if (!file.type.startsWith('audio/')) continue;
      const meta = await getMetadata(file);
      const track: Track = {
        id: crypto.randomUUID(),
        title: meta.title || file.name.replace(/\.[^/.]+$/, ""),
        artist: meta.artist || 'Desconhecido',
        album: meta.album,
        coverUrl: meta.coverUrl,
        duration: 0,
        blob: file,
        addedAt: Date.now(),
        isFavorite: false
      };
      await musicDB.saveTrack(track);
      newTracksBatch.push(track);
    }
    setTracks(prev => [...prev, ...newTracksBatch]);
    e.target.value = '';
  };

  const removeTrack = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await musicDB.deleteTrack(id);
    setTracks(prev => prev.filter(t => t.id !== id));
    setCurrentQueue(prev => prev.filter(t => t.id !== id));
    if (currentTrack?.id === id) { setIsPlaying(false); setCurrentTrackIndex(null); }
  };

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist || playlist.trackIds.includes(trackId)) return;
    const updated = { ...playlist, trackIds: [...playlist.trackIds, trackId] };
    await musicDB.savePlaylist(updated);
    setPlaylists(prev => prev.map(p => p.id === playlistId ? updated : p));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isReady) return <div className="h-screen bg-zinc-950 flex items-center justify-center"><div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>;

  const filteredTracks = tracks.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()) || t.artist.toLowerCase().includes(searchTerm.toLowerCase()));
  const activePlaylist = selectedPlaylistId ? playlists.find(p => p.id === selectedPlaylistId) : null;
  const activePlaylistTracks = activePlaylist ? activePlaylist.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[] : [];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-950 safe-bottom">
      {/* Modais */}
      {isAddingFromLibrary && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col animate-[slideUp_0.3s_ease-out]">
          <header className="p-4 flex items-center gap-4 border-b border-zinc-800">
            <IconButton icon={<ChevronLeft size={24} />} onClick={() => setIsAddingFromLibrary(null)} />
            <h3 className="text-lg font-bold">Adicionar Músicas</h3>
          </header>
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
            <div className="space-y-2">
              {tracks.filter(t => !activePlaylist?.trackIds.includes(t.id)).map(track => (
                <div key={track.id} onClick={() => addTrackToPlaylist(isAddingFromLibrary, track.id)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800 transition-all">
                  <TrackCover track={track} size="md" />
                  <div className="flex-1 min-w-0"><h4 className="text-sm font-medium truncate">{track.title}</h4><p className="text-xs text-zinc-500 truncate">{track.artist}</p></div>
                  <IconButton icon={<PlusCircle size={20} className="text-purple-500" />} />
                </div>
              ))}
            </div>
          </div>
          <div className="p-4"><button onClick={() => setIsAddingFromLibrary(null)} className="w-full py-4 bg-purple-500 rounded-2xl font-bold">Concluído</button></div>
        </div>
      )}

      {isCreatingPlaylist && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-xs bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <h3 className="text-xl font-bold mb-4 text-white">Nova Playlist</h3>
            <input autoFocus type="text" placeholder="Nome da playlist" value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)} className="w-full bg-zinc-800 rounded-xl py-3 px-4 text-white outline-none mb-6 focus:ring-2 focus:ring-purple-500" />
            <div className="flex gap-3"><button onClick={() => setIsCreatingPlaylist(false)} className="flex-1 py-3 rounded-xl bg-zinc-800 text-sm">Cancelar</button><button onClick={async () => {
              if (!newPlaylistName.trim()) return;
              const p = { id: crypto.randomUUID(), name: newPlaylistName, trackIds: [], createdAt: Date.now() };
              await musicDB.savePlaylist(p); setPlaylists(prev => [...prev, p]); setNewPlaylistName(''); setIsCreatingPlaylist(false);
            }} className="flex-1 py-3 rounded-xl bg-purple-500 text-sm font-bold">Criar</button></div>
          </div>
        </div>
      )}

      {showPlaylistPickerFor && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end p-4">
          <div className="w-full bg-zinc-900 rounded-3xl p-6 border border-zinc-800 animate-[slideUp_0.3s_ease-out]">
            <div className="flex justify-between items-center mb-6"><h3 className="font-bold">Adicionar à Playlist</h3><IconButton icon={<X size={20}/>} onClick={() => setShowPlaylistPickerFor(null)}/></div>
            <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
              {playlists.map(p => (
                <button key={p.id} onClick={() => { addTrackToPlaylist(p.id, showPlaylistPickerFor); setShowPlaylistPickerFor(null); }} className="w-full text-left p-4 bg-zinc-800/50 rounded-xl hover:bg-purple-500/20 transition-colors">{p.name}</button>
              ))}
              <button onClick={() => { setShowPlaylistPickerFor(null); setIsCreatingPlaylist(true); }} className="w-full p-4 border border-dashed border-purple-500/50 text-purple-400 rounded-xl">+ Criar Nova</button>
            </div>
          </div>
        </div>
      )}

      <header className="p-4 flex items-center justify-between border-b border-zinc-900">
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-fuchsia-500 bg-clip-text text-transparent">VibePlayer</h1>
        <div className="flex gap-2">
          <IconButton icon={<Search size={20} />} active={activeTab === 'search'} onClick={() => setActiveTab('search')} />
          <IconButton icon={<SettingsIcon size={20} />} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar p-4 pb-48">
        {activeTab === 'search' && (
          <div className="mb-6"><input type="text" placeholder="Buscar música..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-zinc-900 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-purple-500 outline-none" /></div>
        )}

        {(activeTab === 'library' || activeTab === 'search') ? (
          <div>
            <div className="flex justify-between items-center mb-4"><h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Músicas ({filteredTracks.length})</h2><label className="text-xs text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-full cursor-pointer"><Plus size={14} className="inline mr-1"/>Importar<input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileImport} /></label></div>
            {filteredTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-zinc-700">
                <Music size={64} className="mb-4 opacity-10" />
                <p className="font-medium">Biblioteca vazia</p>
                <p className="text-xs opacity-50">Importe arquivos locais para começar</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTracks.map((track, idx) => (
                  <div key={track.id} onClick={() => { setCurrentQueue(filteredTracks); setCurrentTrackIndex(idx); setIsPlaying(true); }} className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${currentTrack?.id === track.id ? 'bg-zinc-900 shadow-lg shadow-purple-500/5' : 'hover:bg-zinc-900/30'}`}>
                    <TrackCover track={track} size="md" />
                    <div className="flex-1 min-w-0"><h3 className={`text-sm font-medium truncate ${currentTrack?.id === track.id ? 'text-purple-400' : ''}`}>{track.title}</h3><p className="text-xs text-zinc-500 truncate">{track.artist}</p></div>
                    <div className="flex items-center gap-1">
                      <IconButton icon={<Plus size={16} />} onClick={e => { e.stopPropagation(); setShowPlaylistPickerFor(track.id); }} />
                      <IconButton icon={<Trash2 size={16} />} onClick={e => removeTrack(track.id, e)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'playlists' ? (
          <div>
            {selectedPlaylistId && activePlaylist ? (
              <div className="animate-[slideUp_0.3s_ease-out]">
                <div className="flex items-center gap-3 mb-6"><IconButton icon={<ChevronLeft size={24}/>} onClick={() => setSelectedPlaylistId(null)}/><h2 className="text-xl font-bold truncate flex-1">{activePlaylist.name}</h2><IconButton icon={<Trash2 size={20} className="text-red-500" onClick={async () => { if(confirm("Apagar playlist?")) { await musicDB.deletePlaylist(activePlaylist.id); setPlaylists(p => p.filter(x => x.id !== activePlaylist.id)); setSelectedPlaylistId(null); } }}/>}</div>
                <button onClick={() => { setCurrentQueue(activePlaylistTracks); setCurrentTrackIndex(0); setIsPlaying(true); }} disabled={activePlaylistTracks.length === 0} className="w-full mb-6 py-4 bg-purple-500 disabled:opacity-30 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg"><Play size={20} fill="white" /> Reproduzir Tudo</button>
                {activePlaylistTracks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-6">
                    <p className="text-zinc-500 font-medium">Esta playlist não tem músicas</p>
                    <button onClick={() => setIsAddingFromLibrary(activePlaylist.id)} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-8 py-4 rounded-2xl text-purple-400 font-bold hover:bg-zinc-800 transition-all shadow-xl"><PlusCircle size={22} /><span>Adicionar da Biblioteca</span></button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {activePlaylistTracks.map((track, idx) => (
                      <div key={track.id} onClick={() => { setCurrentQueue(activePlaylistTracks); setCurrentTrackIndex(idx); setIsPlaying(true); }} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/40">
                        <TrackCover track={track} size="sm" />
                        <div className="flex-1 min-w-0"><h3 className="text-sm font-medium truncate">{track.title}</h3><p className="text-xs text-zinc-500">{track.artist}</p></div>
                        <IconButton icon={<X size={14} className="hover:text-red-400" />} onClick={e => { e.stopPropagation(); const updated = { ...activePlaylist, trackIds: activePlaylist.trackIds.filter(tid => tid !== track.id) }; musicDB.savePlaylist(updated); setPlaylists(p => p.map(pl => pl.id === activePlaylist.id ? updated : pl)); }} />
                      </div>
                    ))}
                    <div onClick={() => setIsAddingFromLibrary(activePlaylist.id)} className="flex items-center gap-3 p-4 rounded-2xl border border-dashed border-zinc-800 mt-6 text-purple-400 font-bold cursor-pointer hover:bg-zinc-900/20 transition-all group">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20"><Music size={20} /></div>
                      <span>Adicionar mais músicas</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setIsCreatingPlaylist(true)} className="aspect-square bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-purple-400 transition-colors"><Plus size={32}/><span className="text-xs font-bold">Nova Playlist</span></button>
                {playlists.map(p => (
                  <div key={p.id} onClick={() => setSelectedPlaylistId(p.id)} className="aspect-square bg-zinc-900 rounded-3xl p-4 flex flex-col justify-end border border-zinc-900 hover:border-purple-500/50 transition-all relative overflow-hidden group">
                    <ListMusic className="mb-auto text-purple-500" size={32}/>
                    <h3 className="font-bold truncate text-sm z-10">{p.name}</h3><p className="text-[10px] text-zinc-500 z-10">{p.trackIds.length} Músicas</p>
                    <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 bg-zinc-900/50 rounded-3xl border border-zinc-900">
            <h3 className="font-bold mb-4 text-purple-400 flex items-center gap-2"><SettingsIcon size={18}/> VibePlayer v1.4.1</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-6">Reprodutor web avançado. Performance de áudio otimizada e correções de deploy aplicadas.</p>
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <div className="flex justify-between text-xs"><span>Tema</span><span className="text-purple-400 font-medium">Dark Neon</span></div>
              <div className="flex justify-between text-xs"><span>Armazenamento</span><span className="text-purple-400 font-medium">IndexedDB (Offline)</span></div>
            </div>
          </div>
        )}
      </main>

      {/* Mini-player completo com controles */}
      {currentTrack && (
        <div onClick={() => setIsFullScreen(true)} className="fixed bottom-[76px] left-4 right-4 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl p-2.5 flex items-center gap-3 shadow-2xl z-40 animate-[slideUp_0.3s_ease-out]">
          <TrackCover track={currentTrack} size="sm" />
          <div className="flex-1 min-w-0"><h4 className="text-[11px] font-bold truncate leading-tight">{currentTrack.title}</h4><p className="text-[9px] text-zinc-500 truncate">{currentTrack.artist}</p></div>
          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            <IconButton icon={<SkipBack size={18} fill="currentColor" />} onClick={handlePrev} />
            <IconButton icon={isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />} onClick={togglePlay} />
            <IconButton icon={<SkipForward size={18} fill="currentColor" />} onClick={handleNext} />
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 flex justify-around p-3 pb-safe z-50">
        <button onClick={() => { setActiveTab('library'); setSelectedPlaylistId(null); }} className={`flex flex-col items-center gap-1 ${activeTab === 'library' ? 'text-purple-500' : 'text-zinc-500'}`}><Library size={20} /><span className="text-[10px]">Biblioteca</span></button>
        <button onClick={() => { setActiveTab('playlists'); setSelectedPlaylistId(null); }} className={`flex flex-col items-center gap-1 ${activeTab === 'playlists' ? 'text-purple-500' : 'text-zinc-500'}`}><ListMusic size={20} /><span className="text-[10px]">Playlists</span></button>
        <button onClick={() => { setActiveTab('search'); setSelectedPlaylistId(null); }} className={`flex flex-col items-center gap-1 ${activeTab === 'search' ? 'text-purple-500' : 'text-zinc-500'}`}><Search size={20} /><span className="text-[10px]">Busca</span></button>
      </nav>

      {/* Tela Cheia com cabeçalho informativo */}
      {isFullScreen && currentTrack && (
        <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col p-6 animate-[slideUp_0.4s_ease-out]">
          <div className="flex justify-between items-center mb-8">
            <IconButton icon={<ChevronDown size={32} />} onClick={() => setIsFullScreen(false)} />
            <div className="text-center flex-1 pr-10">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Tocando agora</p>
              <p className="text-xs font-medium text-purple-400 truncate max-w-[200px] mx-auto">{currentTrack.title}</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full aspect-square max-w-[320px] mb-12 transform transition-transform duration-500 hover:scale-105">
              <TrackCover track={currentTrack} size="lg" />
            </div>
            <h2 className="text-2xl font-bold mb-1 text-center truncate w-full px-6">{currentTrack.title}</h2>
            <p className="text-purple-400 mb-12 text-lg font-medium">{currentTrack.artist}</p>
            <ProgressBar current={currentTime} total={audioRef.current.duration || 0} onChange={v => { audioRef.current.currentTime = v; }} className="mb-8" />
            <div className="flex justify-between w-full text-[10px] text-zinc-500 px-1 mb-8"><span>{formatTime(currentTime)}</span><span>{formatTime(audioRef.current.duration || 0)}</span></div>
            <div className="flex items-center gap-8 mb-12">
              <IconButton icon={<SkipBack size={40} fill="white" />} onClick={handlePrev} />
              <button onClick={togglePlay} className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-black active:scale-90 transition-transform shadow-xl shadow-purple-500/20">
                {isPlaying ? <Pause size={40} fill="black" /> : <Play size={40} fill="black" className="ml-1" />}
              </button>
              <IconButton icon={<SkipForward size={40} fill="white" />} onClick={handleNext} />
            </div>
            <div className="flex gap-12 text-zinc-500">
               <IconButton icon={<Shuffle size={20} />} active={shuffle} onClick={() => setShuffle(!shuffle)} />
               <IconButton icon={<Repeat size={20} />} active={repeat !== RepeatMode.None} onClick={() => {
                 const modes = [RepeatMode.None, RepeatMode.All, RepeatMode.One];
                 setRepeat(modes[(modes.indexOf(repeat) + 1) % modes.length]);
               }} />
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}
