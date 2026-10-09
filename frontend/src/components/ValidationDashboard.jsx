import React, { useState } from 'react';
import { Upload, BarChart3, ShieldCheck } from 'lucide-react';
import { API_BASE } from '../config';

export default function ValidationDashboard({ result, onValidationUpdate }) {
  const [isValidating, setIsValidating] = useState(false);
  const [refFile, setRefFile] = useState(null);
  const [localValidation, setLocalValidation] = useState(result?.validation || null);
  const [activeTab, setActiveTab] = useState('comparison');

  if (!result) {
    return (
      <div className="card" style={{ padding: 36, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No elevation model available for validation.</p>
      </div>
    );
  }

  const { textures, task_id, stability_benchmarks } = result;
  const validation = localValidation || result.validation;
  const metrics = validation?.metrics;

  const handleCustomValidation = async (e) => {
    e.preventDefault();
    if (!refFile || !task_id) return;

    setIsValidating(true);
    const formData = new FormData();
    formData.append('task_id', task_id);
    formData.append('reference_file', refFile);

    try {
      const res = await fetch(`${API_BASE}/api/validate`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const valData = await res.json();
        setLocalValidation(valData);
        if (onValidationUpdate) onValidationUpdate(valData);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Validation failed: ' + (err.detail || 'Error processing reference raster.'));
      }
    } catch (err) {
      alert('Error during validation: ' + err.message);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {metrics ? (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-title">Root Mean Square Error</div>
            <div className="kpi-num" style={{ color: metrics.rmse_m < 6.0 ? 'var(--color-success)' : 'var(--color-primary)' }}>
              {metrics.rmse_m} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>m</span>
            </div>
            <div className="kpi-sub">
              {metrics.rmse_m < 5.0 ? '✓ High Accuracy (LiDAR aligned)' : 'Standard topographic tolerance'}
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">Mean Absolute Error (MAE)</div>
            <div className="kpi-num">
              {metrics.mae_m} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>m</span>
            </div>
            <div className="kpi-sub">
              Average absolute height residual
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">Pearson Correlation (r)</div>
            <div className="kpi-num" style={{ color: 'var(--color-primary)' }}>
              {metrics.pearson_r.toFixed(3)}
            </div>
            <div className="kpi-sub">
              {metrics.pearson_r > 0.90 ? 'Strong structural correlation' : 'Moderate correlation'}
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">Determination (R²)</div>
            <div className="kpi-num">
              {metrics.r2_score.toFixed(3)}
            </div>
            <div className="kpi-sub">
              Topographic variance explained
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 14, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af' }}>
                Benchmark Ground Truth Ready
              </div>
              <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: 2 }}>
                Load one of the 4 benchmark datasets or upload your own LiDAR / Reference DEM below to calculate real RMSE, MAE, and Pearson correlation.
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-muted)',
          padding: 3,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          width: 'fit-content'
        }}>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparison')}
          >
            <ShieldCheck size={14} />
            <span>Residual Error Comparison</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'stability' ? 'active' : ''}`}
            onClick={() => setActiveTab('stability')}
          >
            <BarChart3 size={14} />
            <span>Landscape Stability Matrix (4 Archetypes)</span>
          </button>
        </div>

        <form onSubmit={handleCustomValidation} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>
            <Upload size={12} />
            <span>{refFile ? refFile.name : 'Upload Reference LiDAR'}</span>
            <input
              type="file"
              accept=".tif,.tiff,.png,.jpg"
              style={{ display: 'none' }}
              onChange={(e) => setRefFile(e.target.files[0])}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!refFile || isValidating}
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            {isValidating ? 'Validating...' : 'Run Benchmark'}
          </button>
        </form>
      </div>

      {activeTab === 'comparison' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8125rem', fontWeight: 600 }}>
              <span>1. Estimated DSM</span>
              <span className="tag">Depth Model Output</span>
            </div>
            <img
              src={textures.elevation_dsm}
              alt="Estimated DSM"
              style={{ width: '100%', height: 240, objectFit: 'contain', backgroundColor: '#000000', borderRadius: 'var(--radius-sm)' }}
            />
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8125rem', fontWeight: 600 }}>
              <span>2. Reference LiDAR / DEM</span>
              <span className="tag tag-success">Ground Truth</span>
            </div>
            {validation?.reference_map_b64 ? (
              <img
                src={validation.reference_map_b64}
                alt="Reference DEM"
                style={{ width: '100%', height: 240, objectFit: 'contain', backgroundColor: '#000000', borderRadius: 'var(--radius-sm)' }}
              />
            ) : (
              <div style={{
                height: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-muted)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: '0.78rem',
                textAlign: 'center',
                padding: 16
              }}>
                Upload a reference raster or select a benchmark sample to visualize ground truth.
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8125rem', fontWeight: 600 }}>
              <span>3. Residual Error (Z_pred - Z_ref)</span>
              <span className="tag tag-primary font-mono">Heatmap</span>
            </div>
            {validation?.residual_map_b64 ? (
              <img
                src={validation.residual_map_b64}
                alt="Residual Error Map"
                style={{ width: '100%', height: 240, objectFit: 'contain', backgroundColor: '#000000', borderRadius: 'var(--radius-sm)' }}
              />
            ) : (
              <div style={{
                height: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-muted)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: '0.78rem',
                textAlign: 'center',
                padding: 16
              }}>
                Residual error heatmap will appear here upon benchmark calculation.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'stability' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Performance Stability Across Landscape Archetypes
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Evaluation across Urban, Sparse, Hilly, and Forested terrains against airborne LiDAR baselines.
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78125rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 10px' }}>Landscape Type</th>
                  <th style={{ padding: '8px 10px' }}>Geomorphic Characteristics</th>
                  <th style={{ padding: '8px 10px' }}>RMSE (m)</th>
                  <th style={{ padding: '8px 10px' }}>MAE (m)</th>
                  <th style={{ padding: '8px 10px' }}>Pearson (r)</th>
                  <th style={{ padding: '8px 10px' }}>R²</th>
                  <th style={{ padding: '8px 10px' }}>Stability</th>
                </tr>
              </thead>
              <tbody>
                {stability_benchmarks && Object.entries(stability_benchmarks).map(([key, val]) => (
                  <tr key={key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 600 }}>{val.landscape}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--text-secondary)' }}>{val.challenge}</td>
                    <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{val.rmse_m.toFixed(2)} m</td>
                    <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)' }}>{val.mae_m.toFixed(2)} m</td>
                    <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{val.pearson_r.toFixed(3)}</td>
                    <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)' }}>{val.r2_score.toFixed(3)}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <span className="tag tag-success font-mono">{val.stability}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
