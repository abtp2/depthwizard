import React, { useState } from 'react';

export default function ResultsDashboard({ result, onSampleTransect, transectData }) {
  const [transectType, setTransectType] = useState('horizontal');

  if (!result) return null;

  const { textures, geospatial, validation } = result;
  const elev = geospatial.elevation;
  const metrics = validation?.metrics;

  const handleTransect = (type) => {
    setTransectType(type);
    if (!onSampleTransect) return;
    if (type === 'horizontal') onSampleTransect(0.0, 0.5, 1.0, 0.5);
    else if (type === 'vertical') onSampleTransect(0.5, 0.0, 0.5, 1.0);
    else if (type === 'diagonal') onSampleTransect(0.0, 0.0, 1.0, 1.0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {metrics && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 14px',
          fontSize: '0.8rem'
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>LiDAR Validation:</span>
          <span>RMSE: <strong className="font-mono">{metrics.rmse_m}m</strong></span>
          <span>MAE: <strong className="font-mono">{metrics.mae_m}m</strong></span>
          <span>Correlation: <strong className="font-mono" style={{ color: 'var(--color-primary)' }}>{metrics.pearson_r.toFixed(3)}</strong></span>
          <span className="tag tag-success" style={{ fontSize: '0.7rem' }}>Validated</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <div className="card" style={{ padding: 10 }}>
          <div style={{ marginBottom: 6, fontSize: '0.78125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            1. Optical Satellite Image
          </div>
          <img
            src={textures.optical}
            alt="Optical"
            style={{ width: '100%', height: 230, objectFit: 'contain', backgroundColor: '#000000', borderRadius: 'var(--radius-sm)' }}
          />
        </div>

        <div className="card" style={{ padding: 10 }}>
          <div style={{ marginBottom: 6, fontSize: '0.78125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            2. Relative Depth Map (Viridis)
          </div>
          <img
            src={textures.relative_depth}
            alt="Depth Map"
            style={{ width: '100%', height: 230, objectFit: 'contain', backgroundColor: '#000000', borderRadius: 'var(--radius-sm)' }}
          />
        </div>

        <div className="card" style={{ padding: 10 }}>
          <div style={{ marginBottom: 6, fontSize: '0.78125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            3. Digital Surface Model (DSM Elevation)
          </div>
          <img
            src={textures.elevation_dsm}
            alt="Calibrated DSM"
            style={{ width: '100%', height: 230, objectFit: 'contain', backgroundColor: '#000000', borderRadius: 'var(--radius-sm)' }}
          />
        </div>

        <div className="card" style={{ padding: 10 }}>
          <div style={{ marginBottom: 6, fontSize: '0.78125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            4. Slope Heatmap (Horn 3x3)
          </div>
          <img
            src={textures.slope}
            alt="Slope Map"
            style={{ width: '100%', height: 230, objectFit: 'contain', backgroundColor: '#000000', borderRadius: 'var(--radius-sm)' }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Elevation Cross-Section Transect</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {['horizontal', 'vertical', 'diagonal'].map((t) => (
              <button
                key={t}
                className="btn btn-secondary"
                style={{
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  backgroundColor: transectType === t ? 'var(--color-primary)' : 'var(--bg-surface)',
                  color: transectType === t ? '#ffffff' : 'var(--text-secondary)',
                  borderColor: transectType === t ? 'var(--color-primary)' : 'var(--border-color)',
                  textTransform: 'capitalize'
                }}
                onClick={() => handleTransect(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          height: 95,
          border: '1px solid var(--border-color)',
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span>Max: {elev.max_m}m</span>
            <span>Profile Curve</span>
            <span>Min: {elev.min_m}m</span>
          </div>

          <svg viewBox="0 0 400 60" style={{ width: '100%', height: 50 }}>
            {transectData && transectData.length > 0 ? (
              <polyline
                fill="none"
                stroke="#1e3a8a"
                strokeWidth="2"
                points={transectData.map((pt, idx) => {
                  const x = (idx / (transectData.length - 1)) * 400;
                  const normH = (pt.elevation_m - elev.min_m) / (elev.relief_m || 1);
                  const y = 50 - normH * 40;
                  return `${x},${y}`;
                }).join(' ')}
              />
            ) : (
              <polyline
                fill="none"
                stroke="#1e3a8a"
                strokeWidth="2"
                points="0,45 50,40 100,30 150,15 200,20 250,35 300,15 350,25 400,45"
              />
            )}
          </svg>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            <span>0m (Start)</span>
            <span>Distance Profile</span>
            <span>End</span>
          </div>
        </div>
      </div>
    </div>
  );
}
