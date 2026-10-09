import React from 'react';
import { Upload, Download } from 'lucide-react';
import { API_BASE } from '../config';

export default function Navbar({ onNewUpload, exports, hasResult, geometadata }) {
  const isGeo = geometadata?.is_georeferenced;

  return (
    <header style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '0 16px',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26,
            height: 26,
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 700,
            fontSize: '0.8rem'
          }}>
            DW
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            DepthWizard
          </span>
          {hasResult && (
            <span className={`tag ${isGeo ? 'tag-primary' : ''}`} style={{ fontSize: '0.68rem' }}>
              {isGeo ? 'Metric DSM' : 'Relative rDSM'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasResult && (
            <>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                onClick={onNewUpload}
              >
                <Upload size={12} />
                <span>Upload New</span>
              </button>

              {exports?.geotiff_url && (
                <a
                  href={`${API_BASE}${exports.geotiff_url}`}
                  download
                  className="btn btn-primary"
                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                >
                  <Download size={12} />
                  <span>GeoTIFF</span>
                </a>
              )}

              {exports?.obj_url && (
                <a
                  href={`${API_BASE}${exports.obj_url}`}
                  download
                  className="btn btn-secondary"
                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                >
                  <Download size={12} />
                  <span>3D OBJ</span>
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
