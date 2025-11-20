let scene, camera, renderer;
let bars = [], fireflies, videoPlane, bgPlane;
let count = 0;
let analyser, dataArray;
let sound, audioLoader;
let isPlaying = false;
let videoElement;

const playBtn = document.getElementById('playBtn');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const loadingContainer = document.getElementById('loading-container');
const loadingText = document.getElementById('loading-text');

// Resource tracking
const resources = {
    audio: false,
    video: false,
    image: false
};

function checkResourcesLoaded() {
    if (resources.audio && resources.video && resources.image) {
        // All loaded
        loadingContainer.style.display = 'none';
        playBtn.style.display = 'flex';
        statusDiv.innerText = "Ready to play";
    }
}

init();
animate();

function init() {
    // 1. Setup Scene
    scene = new THREE.Scene();

    // 2. Setup Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.z = 1000;
    camera.position.y = 0; // Reset to 0 to look straight on (removes tilt)
    camera.lookAt(0, 0, 0);

    // 3. Setup Renderer
    // Optimize: Disable antialias and use medium precision to save RAM
    renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: false, 
        powerPreference: "high-performance",
        precision: "mediump"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Limit pixel ratio to 2 (prevents 3x/4x buffers on high-res mobile screens)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 3.1 Setup Static Background (nen.png)
    const bgTexture = new THREE.TextureLoader().load('nen.png', function(tex) {
        tex.minFilter = THREE.LinearFilter; // Disable mipmaps to save texture memory
        tex.generateMipmaps = false;
        updatePlaneSizes(); 
        resources.image = true;
        checkResourcesLoaded();
    });
    // Darken the background by using a grey color
    const bgMaterial = new THREE.MeshBasicMaterial({ 
        map: bgTexture, 
        depthWrite: false,
        color: 0xaaaaaa // Brighter grey (was 0x888888)
    });
    const bgGeometry = new THREE.PlaneGeometry(1, 1);
    bgPlane = new THREE.Mesh(bgGeometry, bgMaterial);
    bgPlane.position.z = -4000; // Far background
    scene.add(bgPlane);

    // 3.5 Setup Background Video Plane (Chroma Key)
    videoElement = document.createElement('video');
    videoElement.src = 'sub.mp4';
    videoElement.loop = false; // Don't loop automatically, we control it
    videoElement.muted = true; // Muted because it's just visuals
    videoElement.playsInline = true;
    videoElement.crossOrigin = 'anonymous';
    // Ensure we update size when metadata loads to fix aspect ratio immediately
    videoElement.addEventListener('loadedmetadata', updatePlaneSizes);
    
    // Check when video can play
    videoElement.addEventListener('canplaythrough', () => {
        if (!resources.video) {
            resources.video = true;
            checkResourcesLoaded();
        }
    });
    videoElement.load(); // Trigger load
    
    const videoTexture = new THREE.VideoTexture(videoElement);
    
    // Shader to remove black background
    const videoMaterial = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: videoTexture }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            varying vec2 vUv;
            void main() {
                vec4 texColor = texture2D(map, vUv);
                // Use max channel value to detect black more reliably
                float maxChan = max(max(texColor.r, texColor.g), texColor.b);
                // Make pixels with low brightness transparent
                float alpha = smoothstep(0.05, 0.2, maxChan);
                gl_FragColor = vec4(texColor.rgb, alpha);
            }
        `,
        transparent: true,
        depthWrite: false
    });

    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    videoPlane = new THREE.Mesh(planeGeometry, videoMaterial);
    videoPlane.position.z = -2000; // Further away than before (-1000)
    scene.add(videoPlane);
    
    updatePlaneSizes(); // Initial size

    // 4. Create Visualizer Elements

    // A. Music Bars (Chart Style)
    const barCount = 32; // Reduced from 64 for performance
    // Wider bars to fill the space: 8 width (was 3)
    const barGeometry = new THREE.BoxGeometry(8, 0.5, 3); 
    const barMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    
    // Create a group to center the bars
    const barGroup = new THREE.Group();
    
    for(let i = 0; i < barCount; i++) {
        const bar = new THREE.Mesh(barGeometry, new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        // Position bars in a line with wider spacing (12 instead of 5)
        bar.position.x = (i - barCount / 2) * 12; 
        bar.position.y = -320; // Move down even further (was -250) to be "nhỏ ở bên dưới"
        barGroup.add(bar);
        bars.push(bar);
    }
    scene.add(barGroup);

    // B. Firefly Particles (Ambient)
    const fireflyCount = 200; // Reduced from 1000 for performance
    const fireflyGeometry = new THREE.BufferGeometry();
    const fireflyPositions = [];
    const fireflyScales = [];

    for (let i = 0; i < fireflyCount; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 1000;
        const z = (Math.random() - 0.5) * 2000;
        fireflyPositions.push(x, y, z);
        fireflyScales.push(Math.random() * 2);
    }

    fireflyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fireflyPositions, 3));
    fireflyGeometry.setAttribute('scale', new THREE.Float32BufferAttribute(fireflyScales, 1));

    const fireflyMaterial = new THREE.PointsMaterial({
        color: 0xffff00, // Yellow/Gold for fireflies
        size: 20, // Bigger size (was 5)
        map: getSprite(),
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8, // Slightly more opaque to be visible at small size
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
    scene.add(fireflies);

    // 5. Setup Audio
    const listener = new THREE.AudioListener();
    camera.add(listener);

    sound = new THREE.Audio(listener);
    audioLoader = new THREE.AudioLoader();
    analyser = new THREE.AudioAnalyser(sound, 128); // fftSize 128

    // Preload Audio
    audioLoader.load('nhac.wav', function(buffer) {
        sound.setBuffer(buffer);
        sound.setLoop(false); 
        sound.setVolume(0.5);
        resources.audio = true;
        checkResourcesLoaded();
    }, (xhr) => {
        // Optional: Update loading text with percentage
        if (loadingText) {
            const percent = Math.floor((xhr.loaded / xhr.total) * 100);
            loadingText.innerText = `Loading Audio... ${percent}%`;
        }
    });

    // 6. Event Listeners
    window.addEventListener('resize', onWindowResize);
    
    playBtn.addEventListener('click', () => {
        // Hide the button/UI immediately
        uiContainer.style.display = 'none';
        startPlayback();
    });
}

// Removed loadAndPlayMusic as we preload now

function startPlayback() {
    // Reset both to start
    if (sound.isPlaying) sound.stop();
    
    // Start from 12 seconds
    const startTime = 12;
    const endTime = 79; // 1m 19s
    
    sound.offset = startTime;
    videoElement.currentTime = startTime;
    
    sound.play();
    videoElement.play();
    isPlaying = true;
    
    // Sync check loop
    if (window.syncInterval) clearInterval(window.syncInterval);
    
    window.syncInterval = setInterval(() => {
        if (!isPlaying) {
            clearInterval(window.syncInterval);
            return;
        }
        
        // Loop logic: if we pass endTime, go back to startTime
        if (videoElement.currentTime >= endTime || !sound.isPlaying) {
            // Loop back
            videoElement.currentTime = startTime;
            
            if (sound.isPlaying) sound.stop();
            sound.offset = startTime;
            sound.play();
            
            // Ensure video plays
            if (videoElement.paused) videoElement.play();
        }
    }, 100);
}

function updatePlaneSizes() {
    if (!camera) return;
    const vFOV = THREE.MathUtils.degToRad(camera.fov);
    
    // Update Video Plane Size (Maintain Aspect Ratio)
    if (videoPlane && videoElement) {
        const distance = camera.position.z - videoPlane.position.z;
        const viewHeight = 2 * Math.tan(vFOV / 2) * distance;
        const viewWidth = viewHeight * camera.aspect;
        
        // Determine if PC or Mobile based on width
        const isPC = window.innerWidth > 768;
        
        // Smaller on PC (0.5), larger on Mobile (1.0)
        const scaleFactor = isPC ? 0.5 : 1.0;
        
        // Default to screen ratio if video not loaded yet
        let finalWidth = viewWidth * scaleFactor;
        let finalHeight = viewHeight * (isPC ? 0.5 : 0.8);

        // If video metadata is loaded, calculate correct aspect ratio
        if (videoElement.videoWidth && videoElement.videoHeight) {
            const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
            
            // Try to fit width first
            finalHeight = finalWidth / videoAspect;

            // If height is too big, constrain by height
            const maxHeight = viewHeight * (isPC ? 0.6 : 0.95);
            if (finalHeight > maxHeight) {
                finalHeight = maxHeight;
                finalWidth = finalHeight * videoAspect;
            }
        }
        
        videoPlane.scale.set(finalWidth, finalHeight, 1);
    }

    // Update Background Plane Size (Cover mode, at z=-4000)
    if (bgPlane && bgPlane.material.map && bgPlane.material.map.image) {
        const distance = camera.position.z - bgPlane.position.z;
        const viewHeight = 2 * Math.tan(vFOV / 2) * distance;
        const viewWidth = viewHeight * camera.aspect;
        
        const img = bgPlane.material.map.image;
        if (img.width && img.height) {
            const imgAspect = img.width / img.height;
            const viewAspect = viewWidth / viewHeight;
            
            // "Cover" logic: maintain aspect ratio and cover the screen
            if (viewAspect > imgAspect) {
                // View is wider than image -> match width
                bgPlane.scale.set(viewWidth, viewWidth / imgAspect, 1);
            } else {
                // View is taller than image -> match height
                bgPlane.scale.set(viewHeight * imgAspect, viewHeight, 1);
            }
        } else {
             bgPlane.scale.set(viewWidth, viewHeight, 1);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePlaneSizes();
}

function animate() {
    requestAnimationFrame(animate);

    render();
}

// Global reusable objects to reduce GC
const _tempColor = new THREE.Color();
const _dummyObj = new THREE.Object3D(); // If we were using InstancedMesh, but we are using simple meshes for now.

function render() {
    // 1. Animate Bars based on Music
    if (isPlaying && analyser) {
        const data = analyser.getFrequencyData(); // Array of 0-255
        
        // Calculate average frequency for global effects
        let avgFreq = 0;
        for(let i = 0; i < data.length; i++) avgFreq += data[i];
        avgFreq = avgFreq / data.length;
        
        // We have 64 bars, data usually has 64 bins if fftSize is 128
        // If fftSize is larger, we step through data
        
        for(let i = 0; i < bars.length; i++) {
            const val = data[i];
            
            // Scale Y based on frequency value
            // Increased sensitivity: val / 2 (was val / 3) for more reaction
            // But keep max height controlled so it stays "thấp"
            const targetScale = (val / 1.5) + 1; // More sensitive
            
            // Smooth transition could be added here, but direct mapping is punchier
            bars[i].scale.y = targetScale;
            
            // Fancier Color: Cycle through spectrum based on position and time
            // This creates a moving rainbow effect
            const hue = (i / bars.length) + (count * 0.2); 
            bars[i].material.color.setHSL(hue % 1, 1.0, 0.5);
        }

        // Pulse fireflies based on music
        const pulse = avgFreq / 255; // 0.0 to 1.0
        
        // LED Effect for Song Title (Changing Colors)
        // OPTIMIZATION: Throttle DOM updates to every 3 frames to prevent layout thrashing/lag
        if (Math.floor(count * 100) % 3 === 0) {
            const songTitle = document.getElementById('song-title');
            if (songTitle) {
                // Cycle color for title
                const titleHue = (count * 0.1) % 1;
                
                // Efficient color calculation without creating new objects
                // HSL to RGB approximation for performance
                _tempColor.setHSL(titleHue, 1, 0.5);
                
                const r = Math.floor(_tempColor.r * 255);
                const g = Math.floor(_tempColor.g * 255);
                const b = Math.floor(_tempColor.b * 255);
                
                // Glow intensity based on pulse
                const glow = 10 + (pulse * 40); 
                const opacity = 0.5 + (pulse * 0.5);
                
                songTitle.style.textShadow = `
                    0 0 ${glow}px rgba(${r}, ${g}, ${b}, ${opacity}), 
                    0 0 ${glow * 2}px rgba(${r}, ${g}, ${b}, ${opacity * 0.5})
                `;
                // Subtle scale effect
                songTitle.style.transform = `translateX(-50%) scale(${1 + pulse * 0.05})`;
                
                // Also update subtitle color slightly
                const subtitle = document.getElementById('subtitle');
                if(subtitle) {
                     subtitle.style.color = `rgba(${r}, ${g}, ${b}, 0.8)`;
                }
            }
        }

        // Move particles based on music (Dancing effect)
        // We don't change size anymore, we affect the movement in the loop below
        
        // Pass pulse to the animation loop via a variable or just use it directly if scope allows
        // Since we are in the same function scope, we can use 'pulse' in the loop below.
        
        // 2. Animate Fireflies (Ambient + Music Reaction)
        const positions = fireflies.geometry.attributes.position.array;
        for(let i = 0; i < positions.length; i += 3) {
            // Base movement parameters
            let speed = 0.5;
            let amp = 0.5;
            
            // React to music
            if (pulse > 0) {
                speed += pulse * 5.0; // Move much faster
                amp += pulse * 10.0;   // Move much wider
            }

            // Apply movement
            // Y axis movement (Up/Down)
            positions[i + 1] += Math.sin(count * speed + positions[i]) * amp * 0.1; 
            // X axis movement (Left/Right)
            positions[i] += Math.cos(count * speed * 0.8 + positions[i+1]) * amp * 0.1;
            
            // Keep them within bounds (optional, but good if they move too fast)
            // Simple wrap around if they go too far
            if(positions[i] > 1000) positions[i] = -1000;
            if(positions[i] < -1000) positions[i] = 1000;
            if(positions[i+1] > 500) positions[i+1] = -500;
            if(positions[i+1] < -500) positions[i+1] = 500;
        }
        fireflies.geometry.attributes.position.needsUpdate = true;

    } else {
        // Idle animation for bars
        for(let i = 0; i < bars.length; i++) {
            bars[i].scale.y = Math.sin(count * 5 + i * 0.2) * 5 + 6;
            // Idle color cycle
            const hue = (i / bars.length) + (count * 0.05);
            bars[i].material.color.setHSL(hue % 1, 1, 0.5);
        }
        
        // Idle animation for fireflies
        const positions = fireflies.geometry.attributes.position.array;
        for(let i = 0; i < positions.length; i += 3) {
            // Gentle floating movement
            positions[i + 1] += Math.sin(count * 0.5 + positions[i]) * 0.5; // Y movement
            positions[i] += Math.cos(count * 0.3 + positions[i+1]) * 0.2; // X movement
        }
        fireflies.geometry.attributes.position.needsUpdate = true;
    }
    
    // Rotate firefly system slowly
    fireflies.rotation.y += 0.0005;

    count += 0.01;
    renderer.render(scene, camera);
}

function getSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    
    // Draw a circle with gradient
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}
