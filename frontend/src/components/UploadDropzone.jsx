import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Check, Globe, Mountain, Building2, Trees, Compass } from 'lucide-react';
import { API_BASE } from '../config';

export default function UploadDropzone({ onProcess, onProcessSample, isProcessing }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [samples, setSamples] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/samples`)
      .then((res) => res.json())
      .then((data) => setSamples(data))
      .catch((err) => console.log(err));
  }, []);

  const handleFile = (file) => {
    if (file) {
      setSelectedFile(file);
      const isTiff = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');
      if (isTiff) {
        setPreviewUrl(null);
      } else {
        setPreviewUrl(URL.createObjectURL(file));
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('calibration_mode', 'auto');
    formData.append('model_method', 'ensemble');
    formData.append('vertical_exaggeration', 0.4);

    onProcess(formData);
  };

  const landscapeIcons = {
    urban: <Building2 size={16} color="var(--color-primary)" />,
    sparse: <Compass size={16} color="#d97706" />,
    hilly: <Mountain size={16} color="#0284c7" />,
    forested: <Trees size={16} color="#059669" />
  };

  return (
    <div style={{ maxWidth: 680, margin: '20px auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Upload Remote Sensing Image
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Transform single-view satellite or aerial imagery into an interactive 3D elevation terrain mesh.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            onClick={() => fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              border: isDragging ? '2px dashed var(--color-primary)' : '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '28px 16px',
              textAlign: 'center',
              backgroundColor: isDragging ? '#eff6ff' : 'var(--bg-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              transition: 'background-color 0.12s ease'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.tif,.tiff"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {selectedFile ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 'var(--radius-sm)', objectFit: 'contain' }}
                  />
                ) : (
                  <Globe size={40} color="var(--color-primary)" />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  <Check size={16} />
                  <span>{selectedFile.name}</span>
                </div>
              </div>
            ) : (
              <>
                <Upload size={32} color="var(--color-primary)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    Drag & drop imagery or click to select
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Supports PNG, JPG, or GeoTIFF
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!selectedFile || isProcessing}
            style={{ padding: '9px 14px', fontSize: '0.85rem' }}
          >
            <Play size={14} />
            <span>{isProcessing ? 'Generating 3D Terrain...' : 'Generate 3D Terrain'}</span>
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>
          Or Select a Sample Scene:
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                fontSize: '0.78125rem',
                textAlign: 'left'
              }}
              onClick={() => onProcessSample(s.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {landscapeIcons[s.category] || <Mountain size={14} />}
                <span>{s.title}</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Load →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
