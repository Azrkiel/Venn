'use client';

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Check, ImagePlus, RotateCcw, Smile, X } from 'lucide-react';
import { avatarOptions, type PictureDraft } from '@/features/profile-pictures/schema';
import { captureJpeg, photoFromFile, stopCamera } from '@/features/profile-pictures/capture';
import { ProfilePicture } from './profile-picture';
import styles from './profile-picture-picker.module.css';

type CameraPhase = 'starting' | 'preview' | 'review' | 'error';

export function ProfilePicturePicker({ share, value, onChange, disabled = false, name }: {
  share: string; value: PictureDraft; onChange: (picture: PictureDraft) => void; disabled?: boolean; name?: string;
}) {
  const [facesOpen, setFacesOpen] = useState(false);
  const [boothOpen, setBoothOpen] = useState(false);
  const [phase, setPhase] = useState<CameraPhase>('starting');
  const [capture, setCapture] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [fileError, setFileError] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraAttempt = useRef(0);
  const fileAttempt = useRef(0);
  const open = useRef(false);
  const mounted = useRef(true);
  const facesId = useId();
  const titleId = useId();
  const blocked = disabled || loadingFile;

  const releaseCamera = useCallback(() => {
    cameraAttempt.current++;
    stopCamera(stream.current); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const closeBooth = useCallback(() => {
    open.current = false;
    releaseCamera();
    fileAttempt.current++;
    dialog.current?.close();
    setBoothOpen(false);
    setLoadingFile(false);
  }, [releaseCamera]);

  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.visibilityState === 'hidden') closeBooth(); };
    window.addEventListener('pagehide', closeBooth);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      mounted.current = false; open.current = false;
      releaseCamera();
      window.removeEventListener('pagehide', closeBooth);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [closeBooth, releaseCamera]);

  // Voting can close while the booth is open; a disabled picker never keeps the camera running.
  useEffect(() => { if (disabled && open.current) closeBooth(); }, [disabled, closeBooth]);

  async function startCamera() {
    releaseCamera();
    const attempt = cameraAttempt.current;
    setCapture(null); setCameraError(''); setPhase('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot open a camera. Choose a photo or pick a face instead.'); setPhase('error'); return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } } });
      if (!mounted.current || !open.current || cameraAttempt.current !== attempt) { stopCamera(next); return; }
      stream.current = next;
      const preview = video.current;
      if (!preview) { releaseCamera(); return; }
      preview.srcObject = next;
      await preview.play();
      if (mounted.current && open.current && cameraAttempt.current === attempt && preview.readyState >= 2) setPhase('preview');
    } catch (cause) {
      if (!mounted.current || !open.current || cameraAttempt.current !== attempt) return;
      releaseCamera();
      const reason = cause instanceof DOMException ? cause.name : '';
      setCameraError(reason === 'NotAllowedError' || reason === 'SecurityError'
        ? 'Camera access is off. Choose a photo or pick a face instead.'
        : reason === 'NotFoundError' ? 'No camera found. Choose a photo or pick a face instead.'
          : 'Couldn’t open your camera. Choose a photo or pick a face instead.');
      setPhase('error');
    }
  }

  function openBooth() {
    if (blocked) return;
    open.current = true; setBoothOpen(true); setFileError('');
    dialog.current?.showModal();
    void startCamera();
  }

  function snap() {
    const preview = video.current;
    if (!preview || phase !== 'preview') return;
    try {
      const jpeg = captureJpeg(preview, preview.videoWidth, preview.videoHeight, true);
      releaseCamera(); setCapture(jpeg); setPhase('review'); setCameraError('');
    } catch (cause) { setCameraError(cause instanceof Error ? cause.message : 'Could not take this photo. Try again.'); }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || disabled) return;
    const attempt = ++fileAttempt.current;
    releaseCamera(); setFileError(''); setLoadingFile(true);
    if (open.current) setPhase('error');
    try {
      const dataUrl = await photoFromFile(file);
      if (!mounted.current || attempt !== fileAttempt.current) return;
      onChange({ kind: 'photo', dataUrl });
      if (open.current) closeBooth();
    } catch (cause) {
      if (mounted.current && attempt === fileAttempt.current) setFileError(cause instanceof Error ? cause.message : 'Could not open this photo. Try another.');
    } finally { if (mounted.current && attempt === fileAttempt.current) setLoadingFile(false); }
  }

  const fileInput = (label: string) => <label className={`${styles.fileButton} ${blocked ? styles.disabled : ''}`}>
    <ImagePlus size={16} aria-hidden="true" />Choose a photo
    <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} disabled={blocked} onChange={chooseFile} />
  </label>;

  return <section className={styles.picker} aria-label="Profile picture">
    <div className={styles.pickerLead}>
      <div className={styles.preview}><ProfilePicture share={share} picture={value} name={name} size={76} />
        {value && <span className={styles.previewCheck} aria-hidden="true"><Check size={13} strokeWidth={3} /></span>}</div>
      <div className={styles.pickerCopy}><div className={styles.pictureLabel}>Your picture <span>Optional</span></div>
        <p>A little personality for the group.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} disabled={blocked} aria-expanded={facesOpen} aria-controls={facesId} onClick={() => setFacesOpen(previous => !previous)}><Smile size={17} aria-hidden="true" />Pick a face</button>
          <button type="button" className={styles.actionButton} disabled={blocked} onClick={openBooth}><Camera size={17} aria-hidden="true" />Take a selfie</button>
        </div>
      </div>
    </div>
    {facesOpen && <div className={styles.faces} id={facesId} aria-label="Goofy faces">
      {avatarOptions.map(option => <button key={option.id} type="button" className={styles.faceOption}
        aria-label={option.label} aria-pressed={value?.kind === 'avatar' && value.id === option.id} disabled={blocked}
        onClick={() => { setFileError(''); onChange({ kind: 'avatar', id: option.id }); }}>
        <ProfilePicture share={share} picture={{ kind: 'avatar', id: option.id }} size={56} decorative />
        <span>{option.label}</span>
      </button>)}
    </div>}
    <div className={styles.secondaryActions}>{fileInput('Choose a profile photo')}
      {value && <button type="button" className={styles.removeButton} disabled={blocked} onClick={() => { setFileError(''); onChange(null); }}>Remove picture</button>}
    </div>
    {loadingFile && <p className={styles.feedback} role="status">Getting your photo ready…</p>}
    {fileError && !boothOpen && <p className={styles.error} role="alert">{fileError}</p>}

    <dialog ref={dialog} className={styles.booth} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); closeBooth(); }} onClose={() => { if (open.current && !dialog.current?.open) closeBooth(); }}>
      <header className={styles.boothHeader}><div><p className={styles.boothKicker}>THE VENN PHOTO BOOTH</p><h3 id={titleId}>Make a face.</h3></div>
        <button type="button" className={styles.closeButton} aria-label="Close selfie booth" onClick={closeBooth}><X size={21} aria-hidden="true" /></button></header>
      <p className={styles.boothCopy}>{phase === 'review' ? 'That’s the one? Make it your picture.' : 'Tongue out. Eyebrows up. You do you.'}</p>
      <div className={styles.viewfinder}>
        <video ref={video} autoPlay muted playsInline className={styles.camera} hidden={phase === 'review' || phase === 'error'}
          aria-label="Live selfie preview" onLoadedData={() => { if (open.current && stream.current) setPhase('preview'); }} />
        {phase === 'review' && capture && /* eslint-disable-next-line @next/next/no-img-element */
          <img className={styles.captured} src={capture} alt="Selfie preview" />}
        {phase === 'starting' && <div className={styles.cameraPlaceholder} role="status"><Camera size={36} aria-hidden="true" /><span>Opening camera…</span></div>}
        {phase === 'error' && <div className={styles.cameraPlaceholder}><Camera size={36} aria-hidden="true" /><span>No camera? No problem.</span></div>}
        <span className={styles.viewfinderCorner} aria-hidden="true" />
      </div>
      {cameraError && <p className={styles.error} role="alert">{cameraError}</p>}
      {fileError && boothOpen && <p className={styles.error} role="alert">{fileError}</p>}
      <div className={styles.boothActions}>{phase === 'review' ? <>
        <button type="button" className={styles.retake} disabled={loadingFile} onClick={() => { void startCamera(); }}><RotateCcw size={17} aria-hidden="true" />Retake</button>
        <button type="button" className={styles.usePhoto} disabled={loadingFile} onClick={() => { if (capture) { onChange({ kind: 'photo', dataUrl: capture }); closeBooth(); } }}>Use photo<Check size={18} aria-hidden="true" /></button>
      </> : <button type="button" className={styles.snap} disabled={phase !== 'preview' || loadingFile} onClick={snap}><span aria-hidden="true" />Snap</button>}</div>
      <div className={styles.boothFallback}>{fileInput('Choose a photo in the selfie booth')}<span>or pick a face after closing</span></div>
    </dialog>
  </section>;
}
