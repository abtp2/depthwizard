import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Maximize2, Minimize2, Crosshair, Play, Pause, RotateCcw } from 'lucide-react';

export default function Terrain3DViewer({ result, height = 620 }) {
  const mountRef = useRef(null);
  const containerRef = useRef(null);

  const [textureMode, setTextureMode] = useState('optical');
  const [verticalExaggeration, setVerticalExaggeration] = useState(0.4);
  const [navMode, setNavMode] = useState('orbit');
  const [isDroneFlying, setIsDroneFlying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inspectedPoint, setInspectedPoint] = useState(null);

  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const terrainMeshRef = useRef(null);
  const terrainGeoRef = useRef(null);
  const markerMeshRef = useRef(null);
  const texturesCacheRef = useRef({});
  const animFrameRef = useRef(null);

  const keysDownRef = useRef({});
  const flyStateRef = useRef({
    yaw: 0,
    pitch: -0.25,
    isMouseDown: false,
    lastMouseX: 0,
    lastMouseY: 0,
    droneTime: 0
  });

  const applyElevationDisplacement = useCallback((geometry, heightGrid, scale, gridSize) => {
    if (!geometry || !heightGrid) return;
    const pos = geometry.attributes.position;
    const N = gridSize;
    const heightScale = 16.0 * scale;

    let idx = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const val = heightGrid[r]?.[c] ?? 0;
        pos.setY(idx, val * heightScale);
        idx++;
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }

    const width = mountRef.current.clientWidth || 800;
    const h = height || 620;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / h, 0.1, 1000);
    camera.position.set(0, 95, 140);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 25;
    controls.maxDistance = 350;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.85);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(-60, 90, -60);
    scene.add(dirLight);

    const groundGrid = new THREE.GridHelper(120, 24, 0xe2e8f0, 0xf1f5f9);
    groundGrid.position.y = -0.5;
    scene.add(groundGrid);

    const markerGeo = new THREE.RingGeometry(0.8, 1.4, 32);
    markerGeo.rotateX(-Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xb91c1c, side: THREE.DoubleSide });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.visible = false;
    scene.add(marker);
    markerMeshRef.current = marker;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e) => {
      if (!terrainMeshRef.current || !rendererRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(terrainMeshRef.current);

      if (hits.length > 0 && terrainMeshRef.current.userData.heightfield) {
        const hit = hits[0];
        const pt = hit.point;
        marker.position.set(pt.x, pt.y + 0.15, pt.z);
        marker.visible = true;

        const planeSize = 80;
        const u = Math.min(Math.max((pt.x / planeSize) + 0.5, 0), 1);
        const v = Math.min(Math.max((pt.z / planeSize) + 0.5, 0), 1);

        const hf = terrainMeshRef.current.userData.heightfield;
        const N = hf.grid_size;
        const colIdx = Math.min(Math.floor(u * (N - 1)), N - 1);
        const rowIdx = Math.min(Math.floor(v * (N - 1)), N - 1);
        const normH = hf.normalized_heights[rowIdx]?.[colIdx] ?? 0;
        const elev = hf.min_elevation_m + normH * hf.relief_m;

        let slopeDeg = 0;
        if (hit.face && hit.face.normal) {
          const normal = hit.face.normal.clone().applyQuaternion(terrainMeshRef.current.quaternion);
          slopeDeg = Math.acos(Math.min(1.0, Math.abs(normal.y))) * (180.0 / Math.PI);
        }

        setInspectedPoint({
          elevation_m: elev.toFixed(1),
          slope_deg: slopeDeg.toFixed(1)
        });
      } else {
        marker.visible = false;
        setInspectedPoint(null);
      }
    };

    const handleMouseDown = (e) => {
      flyStateRef.current.isMouseDown = true;
      flyStateRef.current.lastMouseX = e.clientX;
      flyStateRef.current.lastMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      flyStateRef.current.isMouseDown = false;
    };

    const handleMouseMoveFly = (e) => {
      if (flyStateRef.current.isMouseDown && navMode === 'flythrough') {
        const dx = e.clientX - flyStateRef.current.lastMouseX;
        const dy = e.clientY - flyStateRef.current.lastMouseY;
        flyStateRef.current.lastMouseX = e.clientX;
        flyStateRef.current.lastMouseY = e.clientY;

        flyStateRef.current.yaw -= dx * 0.0035;
        flyStateRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, flyStateRef.current.pitch - dy * 0.0035));

        const euler = new THREE.Euler(flyStateRef.current.pitch, flyStateRef.current.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);
      }
    };

    const handleKeyDown = (e) => { keysDownRef.current[e.code] = true; };
    const handleKeyUp = (e) => { keysDownRef.current[e.code] = false; };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointermove', handlePointerMove);
    domEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMoveFly);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let lastTime = performance.now();
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (isDroneFlying) {
        flyStateRef.current.droneTime += dt * 0.25;
        const t = flyStateRef.current.droneTime;
        const radius = 65;
        const camX = Math.sin(t) * radius;
        const camZ = Math.cos(t) * radius;
        const camY = 30 + Math.sin(t * 2) * 10;
        camera.position.set(camX, camY, camZ);
        camera.lookAt(0, 4, 0);
      } else if (navMode === 'flythrough') {
        const speed = 25.0 * dt;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0);

        if (keysDownRef.current['KeyW'] || keysDownRef.current['ArrowUp']) camera.position.addScaledVector(forward, speed);
        if (keysDownRef.current['KeyS'] || keysDownRef.current['ArrowDown']) camera.position.addScaledVector(forward, -speed);
        if (keysDownRef.current['KeyA'] || keysDownRef.current['ArrowLeft']) camera.position.addScaledVector(right, -speed);
        if (keysDownRef.current['KeyD'] || keysDownRef.current['ArrowRight']) camera.position.addScaledVector(right, speed);
        if (keysDownRef.current['KeyE'] || keysDownRef.current['Space']) camera.position.addScaledVector(up, speed);
        if (keysDownRef.current['KeyQ'] || keysDownRef.current['ShiftLeft']) camera.position.addScaledVector(up, -speed);

        if (camera.position.y < 3.0) camera.position.y = 3.0;
      } else {
        controls.update();
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !renderer || !camera) return;
      const nw = mountRef.current.clientWidth;
      const nh = mountRef.current.clientHeight || height;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMoveFly);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (domEl) {
        domEl.removeEventListener('pointermove', handlePointerMove);
        domEl.removeEventListener('mousedown', handleMouseDown);
        if (domEl.parentElement) domEl.parentElement.removeChild(domEl);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!result || !sceneRef.current) return;

    const { heightfield, textures } = result;
    const grid = heightfield.normalized_heights;
    const gridSize = heightfield.grid_size;
    const planeSize = 80;

    if (terrainMeshRef.current) {
      sceneRef.current.remove(terrainMeshRef.current);
      terrainMeshRef.current.geometry.dispose();
      terrainMeshRef.current.material.dispose();
      terrainMeshRef.current = null;
    }

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, gridSize - 1, gridSize - 1);
    geometry.rotateX(-Math.PI / 2);
    terrainGeoRef.current = geometry;

    applyElevationDisplacement(geometry, grid, verticalExaggeration, gridSize);

    const textureLoader = new THREE.TextureLoader();
    const loaded = {};
    Object.keys(textures).forEach((key) => {
      loaded[key] = textureLoader.load(textures[key], () => {
        if (terrainMeshRef.current) {
          terrainMeshRef.current.material.needsUpdate = true;
        }
      });
      loaded[key].colorSpace = THREE.SRGBColorSpace;
    });
    texturesCacheRef.current = loaded;

    const activeTexture = loaded[textureMode] || loaded.optical;
    const material = new THREE.MeshStandardMaterial({
      map: activeTexture,
      roughness: 0.9,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { heightfield };
    sceneRef.current.add(mesh);
    terrainMeshRef.current = mesh;

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 95, 140);
    }
  }, [result, applyElevationDisplacement]);

  useEffect(() => {
    if (terrainGeoRef.current && result) {
      applyElevationDisplacement(
        terrainGeoRef.current,
        result.heightfield.normalized_heights,
        verticalExaggeration,
        result.heightfield.grid_size
      );
    }
  }, [verticalExaggeration, result, applyElevationDisplacement]);

  useEffect(() => {
    if (terrainMeshRef.current && texturesCacheRef.current) {
      const tex = texturesCacheRef.current[textureMode];
      if (tex) {
        terrainMeshRef.current.material.map = tex;
        terrainMeshRef.current.material.needsUpdate = true;
      }
    }
  }, [textureMode]);

  const handleNavModeChange = (mode) => {
    setNavMode(mode);
    setIsDroneFlying(false);
    if (controlsRef.current) controlsRef.current.enabled = (mode === 'orbit');
    if (mode === 'flythrough' && cameraRef.current) {
      cameraRef.current.position.set(0, 20, 50);
      flyStateRef.current.yaw = 0;
      flyStateRef.current.pitch = -0.2;
    }
  };

  const toggleDroneTour = () => {
    const next = !isDroneFlying;
    setIsDroneFlying(next);
    if (controlsRef.current) controlsRef.current.enabled = !next;
  };

  const resetCamera = () => {
    setIsDroneFlying(false);
    setNavMode('orbit');
    if (controlsRef.current && cameraRef.current) {
      controlsRef.current.enabled = true;
      controlsRef.current.target.set(0, 0, 0);
      cameraRef.current.position.set(0, 95, 140);
      controlsRef.current.update();
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (!result) return null;

  const isRel = !result.geometadata?.is_georeferenced;
  const unit = isRel ? 'rDSM' : 'm';

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        backgroundColor: '#ffffff',
        height: isFullscreen ? '100vh' : 'auto',
        padding: isFullscreen ? 12 : 0
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>
            TEXTURE:
          </span>
          {[
            { id: 'optical', label: 'RGB Image' },
            { id: 'elevation_dsm', label: 'Elevation Map' },
            { id: 'slope', label: 'Slope Map' },
          ].map((tex) => (
            <button
              key={tex.id}
              className="btn"
              style={{
                padding: '3px 8px',
                fontSize: '0.75rem',
                backgroundColor: textureMode === tex.id ? 'var(--color-primary)' : 'var(--bg-muted)',
                color: textureMode === tex.id ? '#ffffff' : 'var(--text-primary)',
                border: '1px solid',
                borderColor: textureMode === tex.id ? 'var(--color-primary)' : 'var(--border-color)',
              }}
              onClick={() => setTextureMode(tex.id)}
            >
              {tex.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Relief:</span>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.1"
              value={verticalExaggeration}
              onChange={(e) => setVerticalExaggeration(parseFloat(e.target.value))}
              style={{ width: 65 }}
            />
            <span className="font-mono" style={{ fontWeight: 600, width: 28 }}>
              {verticalExaggeration.toFixed(1)}x
            </span>
          </div>

          <div style={{ display: 'flex', backgroundColor: 'var(--bg-muted)', padding: 2, borderRadius: 'var(--radius-sm)' }}>
            <button
              type="button"
              className="btn"
              style={{
                padding: '2px 8px',
                fontSize: '0.72rem',
                backgroundColor: navMode === 'orbit' && !isDroneFlying ? '#ffffff' : 'transparent',
                color: navMode === 'orbit' && !isDroneFlying ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontWeight: navMode === 'orbit' && !isDroneFlying ? 600 : 500,
                border: 'none'
              }}
              onClick={() => handleNavModeChange('orbit')}
            >
              Orbit
            </button>
            <button
              type="button"
              className="btn"
              style={{
                padding: '2px 8px',
                fontSize: '0.72rem',
                backgroundColor: navMode === 'flythrough' ? '#ffffff' : 'transparent',
                color: navMode === 'flythrough' ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontWeight: navMode === 'flythrough' ? 600 : 500,
                border: 'none'
              }}
              onClick={() => handleNavModeChange('flythrough')}
            >
              Fly
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: '2px 8px',
              fontSize: '0.72rem',
              backgroundColor: isDroneFlying ? 'var(--color-primary)' : 'var(--bg-surface)',
              color: isDroneFlying ? '#ffffff' : 'var(--text-primary)'
            }}
            onClick={toggleDroneTour}
          >
            {isDroneFlying ? <Pause size={11} /> : <Play size={11} />}
            <span>{isDroneFlying ? 'Pause Tour' : 'Drone Tour'}</span>
          </button>

          <button className="btn btn-secondary" style={{ padding: '3px 6px', fontSize: '0.7rem' }} onClick={resetCamera} title="Reset Camera">
            <RotateCcw size={12} />
          </button>

          <button className="btn btn-secondary" style={{ padding: '3px 6px', fontSize: '0.7rem' }} onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      <div style={{
        position: 'relative',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        height: isFullscreen ? 'calc(100vh - 65px)' : height,
        backgroundColor: '#f8fafc'
      }}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

        {inspectedPoint ? (
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '5px 10px',
            fontSize: '0.75rem',
            zIndex: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Crosshair size={12} color="var(--color-danger)" />
            <span>Elevation:</span>
            <strong className="font-mono" style={{ color: 'var(--color-primary)' }}>
              {inspectedPoint.elevation_m} {unit}
            </strong>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--text-secondary)' }}>Slope:</span>
            <strong className="font-mono">{inspectedPoint.slope_deg}°</strong>
          </div>
        ) : (
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 8px',
            fontSize: '0.6875rem',
            color: 'var(--text-muted)'
          }}>
            {navMode === 'flythrough' ? (
              <span>WASD: Fly • Mouse Drag: Look Around • Space/Shift: Up/Down</span>
            ) : (
              <span>Drag: Rotate • Right-Click: Pan • Scroll: Zoom • Hover: Inspect Height</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
