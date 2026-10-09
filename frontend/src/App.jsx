import React, { useState } from 'react';
import Navbar from './components/Navbar';
import UploadDropzone from './components/UploadDropzone';
import Terrain3DViewer from './components/Terrain3DViewer';
import ResultsDashboard from './components/ResultsDashboard';
import { Eye, Layers } from 'lucide-react';
import { API_BASE } from './config';

export default function App() {
  const [currentResult, setCurrentResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewMode, setViewMode] = useState('3d');
  const [transectData, setTransectData] = useState(null);

  const handleProcessUpload = async (formData) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/process`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentResult(data);
        setViewMode('3d');
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Upload Error: ' + (err.detail || 'Processing failed.'));
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessSample = async (sampleId) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/process-sample/${sampleId}`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentResult(data);
        setViewMode('3d');
      } else {
        alert('Failed to load sample dataset.');
      }
    } catch (e) {
      alert('Sample load error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSampleTransect = async (x1, y1, x2, y2) => {
    if (!currentResult?.task_id) return;
    const body = new FormData();
    body.append('task_id', currentResult.task_id);
    body.append('x1', x1);
    body.append('y1', y1);
    body.append('x2', x2);
    body.append('y2', y2);

    try {
      const res = await fetch(`${API_BASE}/api/profile-transect`, { method: 'POST', body });
      if (res.ok) {
        const data = await res.json();
        setTransectData(data.profile);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const elev = currentResult?.geospatial?.elevation;
  const slope = currentResult?.geospatial?.slope;
  const geomorph = currentResult?.geospatial?.geomorphology;
  const isGeo = currentResult?.geometadata?.is_georeferenced;
  const unit = isGeo ? 'm' : 'rDSM';

  return (
    <div className="app-container">
      <Navbar
        hasResult={!!currentResult}
        onNewUpload={() => setCurrentResult(null)}
        exports={currentResult?.exports}
        geometadata={currentResult?.geometadata}
      />

      <main className="content-wrapper">
        {isProcessing && (
          <div style={{
            maxWidth: 500,
            margin: '20px auto',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1e40af',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            textAlign: 'center',
            fontWeight: 600
          }}>
            Processing terrain and generating 3D elevation model...
          </div>
        )}

        {!currentResult ? (
          <UploadDropzone
            onProcess={handleProcessUpload}
            onProcessSample={handleProcessSample}
            isProcessing={isProcessing}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              fontSize: '0.8125rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Elevation: </span>
                  <strong>{elev?.min_m} - {elev?.max_m} {unit}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 4 }}>(Relief: {elev?.relief_m}{unit})</span>
                </div>
                <span style={{ color: 'var(--border-color)' }}>•</span>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Slope: </span>
                  <strong>{slope?.mean_deg}°</strong>
                </div>
                <span style={{ color: 'var(--border-color)' }}>•</span>
                <span style={{ color: 'var(--text-secondary)' }}>{geomorph?.classification}</span>
              </div>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className={`btn ${viewMode === '3d' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                  onClick={() => setViewMode('3d')}
                >
                  <Eye size={12} />
                  <span>3D Terrain</span>
                </button>
                <button
                  type="button"
                  className={`btn ${viewMode === '2d' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                  onClick={() => setViewMode('2d')}
                >
                  <Layers size={12} />
                  <span>2D Maps</span>
                </button>
              </div>
            </div>

            {viewMode === '3d' ? (
              <Terrain3DViewer result={currentResult} height={600} />
            ) : (
              <ResultsDashboard
                result={currentResult}
                onSampleTransect={handleSampleTransect}
                transectData={transectData}
              />
            )}
          </div>
        )}
      </main>

      <footer style={{
        borderTop: '1px solid var(--border-color)',
        backgroundColor: '#ffffff',
        padding: '10px 20px',
        marginTop: 'auto'
      }}>
        <div style={{
          maxWidth: 1400,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)'
        }}>
          <div><strong>DepthWizard</strong> • Monocular Elevation & 3D Terrain Platform</div>
          <div>GeoTIFF • Three.js WebGL • Python FastAPI</div>
        </div>
      </footer>
    </div>
  );
}
