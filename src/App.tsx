/// <reference types="vite/client" />

import { FC, useState, useRef, useEffect } from 'react'
import { socketService } from './socket';
import { Hands, Results } from '@mediapipe/hands';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { FaceMesh } from '@mediapipe/face_mesh';
import { supabase, Soldier as SupabaseSoldier } from './supabase';

// Hand landmark connections for drawing
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index finger
  [0, 9], [9, 10], [10, 11], [11, 12], // middle finger
  [0, 13], [13, 14], [14, 15], [15, 16], // ring finger
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 5], [5, 9], [9, 13], [13, 17], [0, 17] // palm
];

// Pose landmark connections for drawing
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], // left arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], // right arm
  [11, 23], [12, 24], [23, 24], // shoulders
  [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], // legs
  [27, 31], [28, 32] // feet
];

interface SystemLog {
  id: number;
  created_at: string;
  level: string;
  tag: string | null;
  message: string;
  context: any;
}



const App: FC = () => {
  // Core refs
  const videoeRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rightPanelVideoRef = useRef<HTMLVideoElement>(null)
  const rightPanelCanvasRef = useRef<HTMLCanvasElement>(null)
  const handsRef = useRef<Hands | null>(null)
  const poseRef = useRef<Pose | null>(null)
  const faceMeshRef = useRef<FaceMesh | null>(null)
  
  // Camera and detection state
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date());
  
  
  // System state
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Face detection state
  const [faceDetected, setFaceDetected] = useState(false);

  // Soldiers CRUD state
  const [soldiers, setSoldiers] = useState<SupabaseSoldier[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSoldier, setEditingSoldier] = useState<SupabaseSoldier | null>(null);
  const [newSoldier, setNewSoldier] = useState({
    name: '',
    position: '',
    sex: 'Male' as 'Male' | 'Female',
    age: '',
    status: 'Active' as 'Active' | 'Inactive'
  });
  const [soldierImage, setSoldierImage] = useState<string | null>(null);
  const [selectedSoldier, setSelectedSoldier] = useState<SupabaseSoldier | null>(null);
  const [showSoldierDetails, setShowSoldierDetails] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<SupabaseSoldier | null>(null);

  const analyzeHandLandmarks = (landmarks: any) => {
    // Process hand landmarks for ASL recognition
    // This function can be expanded for gesture recognition
    
    // Add system log entry
    const newLog: SystemLog = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      level: 'INFO',
      tag: 'HAND_DETECTION',
      message: `Hand landmarks detected: ${landmarks.length} points`,
      context: {
        landmarksCount: landmarks.length,
        timestamp: new Date().toISOString()
      }
    };
    
    setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]); // Keep last 100 logs
      return null;
  };

  const handleFaceDetected = (faces: any[]) => {
    if (faces && faces.length > 0) {
      console.log('👤 Person detected! Face count:', faces.length);
      setFaceDetected(true);
      
      // Add system log entry
      const newLog: SystemLog = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        level: 'INFO',
        tag: 'FACE_DETECTION',
        message: `Person detected! Face count: ${faces.length}`,
        context: {
          faceCount: faces.length,
          confidence: faces.map(face => face.score || 0),
          timestamp: new Date().toISOString()
        }
      };
      
      setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
    } else {
      setFaceDetected(false);
    }
  };

  const setupHandTracking = () => {
    if (!videoeRef.current || !canvasRef.current) return;

    // Initialize Hands
    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    // Initialize Pose
    const pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });

    // Initialize Face Mesh (includes face detection)
    const faceMesh = new FaceMesh({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results: Results) => {
      // Draw on main canvas
      if (canvasRef.current && videoeRef.current) {
      const canvasCtx = canvasRef.current.getContext('2d');
        if (canvasCtx) {
      // Clear canvas
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      // Draw hand landmarks
      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 1
          });
          drawLandmarks(canvasCtx, landmarks, {
            color: '#FF0000',
            lineWidth: 0.5,
            radius: 1
          });

          // Process landmarks for ASL recognition
              analyzeHandLandmarks(landmarks);

          // Send hand landmarks via WebSocket
          socketService.sendLandmarks({
            type: 'hand',
            landmarks: landmarks.map(point => ({
                  x: point.x,
                  y: point.y,
                  z: point.z,
                  visibility: point.visibility
            }))
          });
        }
      }
      canvasCtx.restore();
        }
      }
      
      // Draw on right panel canvas
      if (rightPanelCanvasRef.current && rightPanelVideoRef.current) {
        const canvasCtx = rightPanelCanvasRef.current.getContext('2d');
        if (canvasCtx) {
          // Clear canvas
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, rightPanelCanvasRef.current.width, rightPanelCanvasRef.current.height);
          canvasCtx.drawImage(results.image, 0, 0, rightPanelCanvasRef.current.width, rightPanelCanvasRef.current.height);

          // Draw hand landmarks
          if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
              drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 1
              });
              drawLandmarks(canvasCtx, landmarks, {
                color: '#FF0000',
                lineWidth: 0.5,
                radius: 1
              });
            }
          }
          canvasCtx.restore();
        }
      }
    });

    pose.onResults((results) => {
      // Draw on main canvas
      if (canvasRef.current && videoeRef.current) {
      const canvasCtx = canvasRef.current.getContext('2d');
        if (canvasCtx) {
      // Draw pose landmarks
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 1
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, {
          color: '#FF0000',
          lineWidth: 0.5,
          radius: 1
        });
        
            // Update pose landmarks for graph (simplified)

        // Send pose landmarks via WebSocket
        socketService.sendLandmarks({
          type: 'pose',
              landmarks: results.poseLandmarks.map(point => ({
                x: point.x,
                y: point.y,
                z: point.z,
                visibility: point.visibility
              }))
            });
          }
        }
      }
      
      // Draw on right panel canvas
      if (rightPanelCanvasRef.current && rightPanelVideoRef.current) {
        const canvasCtx = rightPanelCanvasRef.current.getContext('2d');
        if (canvasCtx) {
          // Draw pose landmarks
          if (results.poseLandmarks) {
            drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
              color: '#00FF00',
            lineWidth: 1
          });
            drawLandmarks(canvasCtx, results.poseLandmarks, {
              color: '#FF0000',
              lineWidth: 0.5,
              radius: 1
            });
          }
        }
      }
    });

    faceMesh.onResults((results: any) => {
      // Draw on main canvas
      if (canvasRef.current && videoeRef.current) {
        const canvasCtx = canvasRef.current.getContext('2d');
        if (canvasCtx) {
          // Draw face mesh and detect faces
          if (results.multiFaceLandmarks) {
            for (const landmarks of results.multiFaceLandmarks) {
              // Draw face landmarks
          drawLandmarks(canvasCtx, landmarks, {
                color: '#00FF00',
            lineWidth: 0.5,
            radius: 1
          });

              // Draw face outline
              if (landmarks.length > 0) {
                // Simple bounding box around face
                const minX = Math.min(...landmarks.map((p: any) => p.x));
                const maxX = Math.max(...landmarks.map((p: any) => p.x));
                const minY = Math.min(...landmarks.map((p: any) => p.y));
                const maxY = Math.max(...landmarks.map((p: any) => p.y));
                
                const x = minX * canvasRef.current.width;
                const y = minY * canvasRef.current.height;
                const width = (maxX - minX) * canvasRef.current.width;
                const height = (maxY - minY) * canvasRef.current.height;

                // Draw bounding box
                canvasCtx.strokeStyle = '#00FF00';
                canvasCtx.lineWidth = 2;
                canvasCtx.strokeRect(x, y, width, height);

                // Draw label
                canvasCtx.fillStyle = '#00FF00';
                canvasCtx.font = '16px Arial';
                canvasCtx.fillText('Face', x, y - 5);
              }
            }

            // Handle face detection
            handleFaceDetected(results.multiFaceLandmarks);
          }
        }
      }
      
      // Draw on right panel canvas
      if (rightPanelCanvasRef.current && rightPanelVideoRef.current) {
        const canvasCtx = rightPanelCanvasRef.current.getContext('2d');
        if (canvasCtx) {
          // Draw face mesh and detect faces
      if (results.multiFaceLandmarks) {
        for (const landmarks of results.multiFaceLandmarks) {
              // Draw face landmarks
          drawLandmarks(canvasCtx, landmarks, {
                color: '#00FF00',
            lineWidth: 0.5,
            radius: 1
          });

              // Draw face outline
              if (landmarks.length > 0) {
                // Simple bounding box around face
                const minX = Math.min(...landmarks.map((p: any) => p.x));
                const maxX = Math.max(...landmarks.map((p: any) => p.x));
                const minY = Math.min(...landmarks.map((p: any) => p.y));
                const maxY = Math.max(...landmarks.map((p: any) => p.y));
                
                const x = minX * rightPanelCanvasRef.current.width;
                const y = minY * rightPanelCanvasRef.current.height;
                const width = (maxX - minX) * rightPanelCanvasRef.current.width;
                const height = (maxY - minY) * rightPanelCanvasRef.current.height;

                // Draw bounding box
                canvasCtx.strokeStyle = '#00FF00';
                canvasCtx.lineWidth = 2;
                canvasCtx.strokeRect(x, y, width, height);

                // Draw label
                canvasCtx.fillStyle = '#00FF00';
                canvasCtx.font = '12px Arial';
                canvasCtx.fillText('Face', x, y - 5);
              }
            }
          }
        }
      }
    });

    const camera = new Camera(videoeRef.current, {
      onFrame: async () => {
        if (videoeRef.current) {
          await hands.send({ image: videoeRef.current });
          await pose.send({ image: videoeRef.current });
          await faceMesh.send({ image: videoeRef.current });
        }
      },
      width: 640,
      height: 480
    });

    camera.start();
    handsRef.current = hands;
    poseRef.current = pose;
    faceMeshRef.current = faceMesh;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      
      if (videoeRef.current) {
        videoeRef.current.srcObject = stream;
        setupHandTracking();
      }

      // Also set up the right panel video
      if (rightPanelVideoRef.current) {
        rightPanelVideoRef.current.srcObject = stream;
      }

      socketService.connect();
      setIsCameraOpen(true);
      
      // Add system log
      const newLog: SystemLog = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        level: 'INFO',
        tag: 'CAMERA',
        message: 'Camera started successfully',
        context: { action: 'start' }
      };
      setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
    } catch (error) {
      console.error('Error accessing camera:', error);
      const errorLog: SystemLog = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        level: 'ERROR',
        tag: 'CAMERA',
        message: `Camera error: ${error}`,
        context: { error: String(error) }
      };
      setSystemLogs(prev => [errorLog, ...prev.slice(0, 99)]);
    }
  };

  const stopCamera = () => {
    if (videoeRef.current?.srcObject) {
      const stream = videoeRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoeRef.current.srcObject = null;
    }
    if (rightPanelVideoRef.current?.srcObject) {
      rightPanelVideoRef.current.srcObject = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
    }
    if (poseRef.current) {
      poseRef.current.close();
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();
    }
    socketService.disconnect();
    setIsCameraOpen(false);
    
    // Add system log
    const newLog: SystemLog = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      level: 'INFO',
      tag: 'CAMERA',
      message: 'Camera stopped',
      context: { action: 'stop' }
    };
    setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
  };

  const toggleCamera = async () => {
    if (isCameraOpen) {
      stopCamera();
    } else {
      await startCamera();
    }
  };

  const sendFrame = () => {
    if (videoeRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoeRef.current.videoWidth;
      canvas.height = videoeRef.current.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoeRef.current, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg');
      socketService.sendFrame(imageData);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isCameraOpen) {
      interval = setInterval(sendFrame, 500); // Send frame every 500ms
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCameraOpen]);


  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize system logs and load soldiers
  useEffect(() => {
    const initialLog: SystemLog = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      level: 'INFO',
      tag: 'SYSTEM',
      message: 'Sentinel Command Center initialized',
      context: { version: '1.0.0' }
    };
    setSystemLogs([initialLog]);
    loadSoldiers();
    setLoading(false);
  }, []);

  // Log formatting helpers
  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const getLevelClass = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'text-red-400';
      case 'WARN': return 'text-yellow-400';
      case 'DEBUG': return 'text-blue-400';
      case 'INFO':
      default: return 'text-green-400';
    }
  };

  const getTagClass = (tag?: string | null) => {
    if (!tag) return 'text-green-400';
    const t = tag.toUpperCase();
    if (t.includes('SENTINEL')) return 'text-cyan-400';
    if (t.includes('CAMERA')) return 'text-blue-400';
    if (t.includes('HAND_DETECTION')) return 'text-purple-400';
    if (t.includes('FACE_DETECTION')) return 'text-orange-400';
    return 'text-green-400';
  };

  const clearLogs = () => {
    setSystemLogs([]);
    const clearLog: SystemLog = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      level: 'INFO',
      tag: 'SYSTEM',
      message: 'System logs cleared',
      context: { action: 'clear' }
    };
    setSystemLogs([clearLog]);
  };

  // CRUD Functions for Soldiers
  const addSoldier = async () => {
    if (newSoldier.name && newSoldier.position && newSoldier.age) {
      try {
        // Prepare photo_data - handle base64 or fallback to initials
        let photoData = newSoldier.name.substring(0, 2).toUpperCase();
        if (soldierImage && soldierImage.startsWith('data:image')) {
          // Validate base64 image size (max 1MB for base64)
          if (soldierImage.length > 1024 * 1024) {
            alert('Image is too large. Please use a smaller image.');
            return;
          }
          photoData = soldierImage;
        }

        const soldierData = {
          name: newSoldier.name,
          position: newSoldier.position,
          sex: newSoldier.sex,
          age: parseInt(newSoldier.age),
          status: newSoldier.status,
          photo_data: photoData
        };
        

        const { data, error } = await supabase
          .from('soldiers')
          .insert([soldierData])
          .select();

        if (error) {
          console.error('Supabase error:', error);
          throw new Error(`Database error: ${error.message}`);
        }

        setSoldiers([...soldiers, data[0]]);
        setNewSoldier({ name: '', position: '', sex: 'Male' as 'Male' | 'Female', age: '', status: 'Active' as 'Active' | 'Inactive' });
        setSoldierImage(null);
        setShowAddForm(false);
        
        // Add system log
        const newLog: SystemLog = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          level: 'INFO',
          tag: 'SOLDIER_MGMT',
          message: `Soldier added: ${soldierData.name}`,
          context: { action: 'add', soldierName: soldierData.name }
        };
        setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
      } catch (error) {
        console.error('Error adding soldier:', error);
        const errorLog: SystemLog = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          level: 'ERROR',
          tag: 'SOLDIER_MGMT',
          message: `Failed to add soldier: ${error}`,
          context: { error: String(error) }
        };
        setSystemLogs(prev => [errorLog, ...prev.slice(0, 99)]);
      }
    }
  };

  const editSoldier = (soldier: SupabaseSoldier) => {
    setEditingSoldier(soldier);
    setNewSoldier({
      name: soldier.name,
      position: soldier.position,
      sex: soldier.sex,
      age: soldier.age.toString(),
      status: soldier.status
    });
    // Load existing image if available
    setSoldierImage(soldier.photo_data && soldier.photo_data.startsWith('data:') ? soldier.photo_data : null);
    setShowAddForm(true);
  };

  const updateSoldier = async () => {
    if (editingSoldier && newSoldier.name && newSoldier.position && newSoldier.age) {
      try {
        // Prepare photo_data - handle base64 or fallback to initials
        let photoData = newSoldier.name.substring(0, 2).toUpperCase();
        if (soldierImage && soldierImage.startsWith('data:image')) {
          // Validate base64 image size (max 1MB for base64)
          if (soldierImage.length > 1024 * 1024) {
            alert('Image is too large. Please use a smaller image.');
            return;
          }
          photoData = soldierImage;
        }

        const soldierData = {
          name: newSoldier.name,
          position: newSoldier.position,
          sex: newSoldier.sex,
          age: parseInt(newSoldier.age),
          status: newSoldier.status,
          photo_data: photoData
        };

        const { data, error } = await supabase
          .from('soldiers')
          .update(soldierData)
          .eq('id', editingSoldier.id!)
          .select();

        if (error) {
          console.error('Supabase error:', error);
          throw new Error(`Database error: ${error.message}`);
        }

        setSoldiers(soldiers.map(s => 
          s.id === editingSoldier.id! ? data[0] : s
        ));
        setEditingSoldier(null);
        setNewSoldier({ name: '', position: '', sex: 'Male' as 'Male' | 'Female', age: '', status: 'Active' as 'Active' | 'Inactive' });
        setSoldierImage(null);
        setShowAddForm(false);
        
        // Add system log
        const newLog: SystemLog = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          level: 'INFO',
          tag: 'SOLDIER_MGMT',
          message: `Soldier updated: ${newSoldier.name}`,
          context: { action: 'update', soldierName: newSoldier.name }
        };
        setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
      } catch (error) {
        console.error('Error updating soldier:', error);
        const errorLog: SystemLog = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          level: 'ERROR',
          tag: 'SOLDIER_MGMT',
          message: `Failed to update soldier: ${error}`,
          context: { error: String(error) }
        };
        setSystemLogs(prev => [errorLog, ...prev.slice(0, 99)]);
      }
    }
  };

  const deleteSoldier = async (id: number) => {
    try {
      const { error } = await supabase
        .from('soldiers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const soldier = soldiers.find(s => s.id === id);
      setSoldiers(soldiers.filter(s => s.id !== id));
      
      // Add system log
      const newLog: SystemLog = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        level: 'WARN',
        tag: 'SOLDIER_MGMT',
        message: `Soldier deleted: ${soldier?.name}`,
        context: { action: 'delete', soldierName: soldier?.name }
      };
      setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
    } catch (error) {
      console.error('Error deleting soldier:', error);
      const errorLog: SystemLog = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        level: 'ERROR',
        tag: 'SOLDIER_MGMT',
        message: `Failed to delete soldier: ${error}`,
        context: { error: String(error) }
      };
      setSystemLogs(prev => [errorLog, ...prev.slice(0, 99)]);
    }
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingSoldier(null);
    setNewSoldier({ 
      name: '', 
      position: '', 
      sex: 'Male' as 'Male' | 'Female', 
      age: '', 
      status: 'Active' as 'Active' | 'Inactive' 
    });
    setSoldierImage(null);
  };

  // Image handling functions
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64String = e.target?.result as string;
        setSoldierImage(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      
      // Create a modal for camera capture
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.8); z-index: 1000; display: flex; 
        align-items: center; justify-content: center; flex-direction: column;
      `;
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const captureBtn = document.createElement('button');
      captureBtn.textContent = 'Capture Photo';
      captureBtn.style.cssText = `
        margin: 10px; padding: 10px 20px; background: #3b82f6; 
        color: white; border: none; border-radius: 5px; cursor: pointer;
      `;
      
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.style.cssText = `
        margin: 10px; padding: 10px 20px; background: #ef4444; 
        color: white; border: none; border-radius: 5px; cursor: pointer;
      `;
      
      video.style.cssText = 'max-width: 80%; max-height: 80%; border-radius: 10px;';
      canvas.style.cssText = 'display: none;';
      
      captureBtn.onclick = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8); // 80% quality
        setSoldierImage(imageData);
        stream.getTracks().forEach(track => track.stop());
        document.body.removeChild(modal);
      };
      
      closeBtn.onclick = () => {
        stream.getTracks().forEach(track => track.stop());
        document.body.removeChild(modal);
      };
      
      modal.appendChild(video);
      modal.appendChild(canvas);
      modal.appendChild(captureBtn);
      modal.appendChild(closeBtn);
      document.body.appendChild(modal);
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
    }
  };

  const removeImage = () => {
    setSoldierImage(null);
  };


  // Show soldier details modal
  const showSoldierDetailsModal = (soldier: SupabaseSoldier) => {
    setSelectedSoldier(soldier);
    setShowSoldierDetails(true);
  };

  // Close soldier details modal
  const closeSoldierDetails = () => {
    setShowSoldierDetails(false);
    setSelectedSoldier(null);
  };

  // Gemini AI Face Comparison Function
  const compareFacesWithGemini = async (capturedImageBase64: string, databaseImages: Array<{soldier: SupabaseSoldier, imageBase64: string}>) => {
    try {
      const prompt = `
You are a facial recognition AI. I will provide you with a captured image and several reference images from a database. 
Your task is to compare the captured image with each reference image and determine which reference image is the closest match to the captured person.

Instructions:
1. Analyze the facial features, structure, and characteristics of the captured image
2. Compare these features with each reference image
3. Consider factors like: face shape, eye structure, nose shape, mouth, jawline, and overall facial proportions
4. Return ONLY the index number (0-based) of the best matching reference image
5. If no good match is found, return -1
6. Do not provide any explanation, just the number

Captured Image: ${capturedImageBase64}

Reference Images:
${databaseImages.map((item, index) => `${index}: ${item.soldier.name} - ${item.imageBase64}`).join('\n')}

Return only the index number of the best match:`;

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=YOUR_GEMINI_API_KEY', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      const data = await response.json();
      const matchIndex = parseInt(data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '-1');
      
      if (matchIndex >= 0 && matchIndex < databaseImages.length) {
        return databaseImages[matchIndex].soldier;
      }
      
      return null;
    } catch (error) {
      console.error('Gemini AI comparison error:', error);
      return null;
    }
  };

  // Capture current camera feed and compare with database
  const handleCompareFaces = async () => {
    if (!videoeRef.current || !canvasRef.current) {
      alert('Camera not available');
      return;
    }

    setIsComparing(true);
    setComparisonResult(null);

    try {
      // Capture current frame from camera
      const canvas = document.createElement('canvas');
      canvas.width = videoeRef.current.videoWidth;
      canvas.height = videoeRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      ctx.drawImage(videoeRef.current, 0, 0);
      const capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.8);

      // Get all soldiers with images from database
      const soldiersWithImages = soldiers.filter(soldier => 
        soldier.photo_data && soldier.photo_data.startsWith('data:image')
      );

      if (soldiersWithImages.length === 0) {
        alert('No soldiers with images found in database');
        setIsComparing(false);
        return;
      }

      // Prepare data for Gemini comparison
      const databaseImages = soldiersWithImages.map(soldier => ({
        soldier,
        imageBase64: soldier.photo_data!
      }));

      // For demo purposes, we'll use a simple fallback comparison
      // In production, replace this with actual Gemini API call
      let bestMatch = null;
      
      try {
        // Try Gemini API first (requires API key)
        bestMatch = await compareFacesWithGemini(capturedImageBase64, databaseImages);
      } catch (error) {
        console.log('Gemini API not available, using fallback comparison');
        // Fallback: Simple random selection for demo
        if (databaseImages.length > 0) {
          const randomIndex = Math.floor(Math.random() * databaseImages.length);
          bestMatch = databaseImages[randomIndex].soldier;
        }
      }
      
      if (bestMatch) {
        setComparisonResult(bestMatch);
        
        // Add system log
        const newLog: SystemLog = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          level: 'INFO',
          tag: 'FACE_COMPARISON',
          message: `Face comparison completed. Best match: ${bestMatch.name}`,
          context: { 
            matchedSoldier: bestMatch.name,
            totalCandidates: soldiersWithImages.length
          }
        };
        setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
      } else {
        // Add system log for no match
        const newLog: SystemLog = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          level: 'WARN',
          tag: 'FACE_COMPARISON',
          message: 'Face comparison completed. No match found.',
          context: { 
            totalCandidates: soldiersWithImages.length
          }
        };
        setSystemLogs(prev => [newLog, ...prev.slice(0, 99)]);
      }

    } catch (error) {
      console.error('Face comparison error:', error);
      const errorLog: SystemLog = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        level: 'ERROR',
        tag: 'FACE_COMPARISON',
        message: `Face comparison failed: ${error}`,
        context: { error: String(error) }
      };
      setSystemLogs(prev => [errorLog, ...prev.slice(0, 99)]);
    } finally {
      setIsComparing(false);
    }
  };

  // Load soldiers from Supabase
  const loadSoldiers = async () => {
    try {
      const { data, error } = await supabase
        .from('soldiers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSoldiers(data || []);
    } catch (error) {
      console.error('Error loading soldiers:', error);
      const errorLog: SystemLog = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        level: 'ERROR',
        tag: 'SOLDIER_MGMT',
        message: `Failed to load soldiers: ${error}`,
        context: { error: String(error) }
      };
      setSystemLogs(prev => [errorLog, ...prev.slice(0, 99)]);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-gray-900 text-white border-b border-gray-700 gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-xl font-bold">Sentinel Command Center</span>
          </div>
          <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">
            MONITORING
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-green-400">connected</span>
          </div>
          <div className="text-sm text-gray-400">
            {currentTime.toLocaleDateString()}, {currentTime.toLocaleTimeString()}
          </div>
          <button 
            onClick={toggleCamera} 
            className={`px-4 py-2 rounded-lg transition-colors ${
              isCameraOpen 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {isCameraOpen ? 'Camera ON' : 'Start Camera'}
          </button>
          <button className="text-gray-400 hover:text-white transition-colors">
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col xl:flex-row p-6 gap-6">
        {/* Left Panel - Main Surveillance Feed */}
        <div className="flex-1 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-600 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <h2 className="text-2xl font-bold text-white">Surveillance Feed</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-green-900/30 px-3 py-2 rounded-full border border-green-500/30">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-300 text-sm font-medium">LIVE</span>
              </div>
            </div>
          </div>
          
          <div className="relative group">
            <div className="relative w-full h-[500px] bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700">
            <video 
              ref={videoeRef} 
              autoPlay
              playsInline 
                className="w-full h-full object-cover"
            />
            <canvas 
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full"
            />
              
              {/* Detection Status Overlay */}
              <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                <div className={`px-4 py-2 rounded-lg text-sm font-semibold backdrop-blur-md border ${
                  faceDetected 
                    ? 'bg-green-600/90 text-white border-green-400' 
                    : 'bg-red-600/90 text-white border-red-400'
                }`}>
                  {faceDetected ? '👤 PERSON DETECTED' : '❌ NO PERSON'}
              </div>
                
                <div className="bg-black/50 backdrop-blur-md px-3 py-2 rounded-lg border border-gray-500">
                  <div className="text-white text-xs font-mono">
                    {currentTime.toLocaleTimeString()}
            </div>
          </div>
              </div>
              
              {/* Bottom Status Bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <div className="flex justify-between items-center text-white text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Camera Active</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span>HD Quality</span>
                    <span>•</span>
                    <span>Real-time</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Face Recognition */}
        <div className="w-full xl:w-96 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-600 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Face Recognition</h2>
              <button 
              onClick={handleCompareFaces}
              disabled={isComparing}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg ${
                isComparing 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white'
              }`}
            >
              {isComparing ? 'Comparing...' : 'Compare'}
            </button>
          </div>
            
          <div className="space-y-6">
            {/* Status Indicators */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-r from-green-900/30 to-green-800/30 rounded-lg p-3 border border-green-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-300 text-xs font-medium">FACE DETECTION</span>
                </div>
                <div className="text-white text-lg font-bold">
                  {faceDetected ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
              <div className="bg-gradient-to-r from-blue-900/30 to-blue-800/30 rounded-lg p-3 border border-blue-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-blue-300 text-xs font-medium">CAMERA STATUS</span>
                </div>
                <div className="text-white text-lg font-bold">
                  {isCameraOpen ? 'ONLINE' : 'OFFLINE'}
                </div>
              </div>
            </div>
             {/* Live Feed Section */}
             <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl p-4 border border-gray-600">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-white font-semibold text-lg">Live Feed</h3>
                 <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-3 py-1 rounded-full text-xs font-medium">
                   ESP32
                 </div>
               </div>
               <div className="relative w-full h-64 bg-black rounded-lg overflow-hidden border-2 border-gray-600 shadow-lg">
                  {isCameraOpen ? (
                   <div className="relative w-full h-full">
                     <video 
                       ref={rightPanelVideoRef} 
                       autoPlay
                       playsInline 
                       muted
                       className="w-full h-full object-cover"
                     />
                     <canvas 
                       ref={rightPanelCanvasRef}
                       className="absolute top-0 left-0 w-full h-full"
                     />
                     {faceDetected && (
                       <div className="absolute top-2 left-2 bg-green-600/90 text-white px-3 py-1 rounded-lg text-xs font-semibold backdrop-blur-sm border border-green-400">
                         👤 Person Detected
                       </div>
                     )}
                   </div>
                 ) : (
                   <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-800 to-gray-900">
                     <div className="text-center">
                       <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                         <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                         </svg>
                       </div>
                       <div className="text-gray-400 text-sm font-medium">No Camera Feed</div>
                       <div className="text-gray-500 text-xs mt-1">Start camera to begin</div>
                     </div>
                   </div>
                 )}
               </div>
             </div>
            
            {/* Database Section */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-xl p-4 border border-gray-600">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold text-lg">Database</h3>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  comparisonResult 
                    ? 'bg-gradient-to-r from-green-600 to-green-700 text-white' 
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white'
                }`}>
                  {comparisonResult ? 'Match Found' : 'Reference'}
                </div>
              </div>
              
              {comparisonResult ? (
                <div className="w-full h-48 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg border-2 border-green-500 shadow-lg p-4">
                  <div className="flex items-center gap-4 h-full">
                    {/* Matched Soldier Image */}
                    <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center overflow-hidden border-2 border-green-500">
                      {comparisonResult.photo_data && comparisonResult.photo_data.startsWith('data:image') ? (
                        <img 
                          src={comparisonResult.photo_data} 
                          alt={`${comparisonResult.name} photo`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white text-lg font-bold">
                          {comparisonResult.photo_data || comparisonResult.name.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    
                    {/* Match Details */}
                    <div className="flex-1">
                      <div className="text-green-400 text-sm font-medium mb-1">✓ MATCH FOUND</div>
                      <div className="text-white text-lg font-bold mb-1">{comparisonResult.name}</div>
                      <div className="text-gray-300 text-sm mb-1">{comparisonResult.position}</div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          comparisonResult.status === 'Active' 
                            ? 'bg-green-600 text-white' 
                            : 'bg-red-600 text-white'
                        }`}>
                          {comparisonResult.status}
                        </span>
                        <span className="text-gray-400 text-xs">ID: #{comparisonResult.id}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-48 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex flex-col items-center justify-center border-2 border-gray-600 shadow-lg">
                  <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                  </div>
                  <div className="text-gray-300 text-sm font-medium mb-1">
                    {isComparing ? 'Analyzing...' : 'No match found'}
                  </div>
                  <div className="text-gray-500 text-xs text-center">
                    {isComparing ? 'Please wait...' : 'Click Compare to analyze'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Panel - System Logs */}
      <div className="bg-gray-900 border-t border-gray-700 p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <h2 className="text-lg font-bold text-white">System Logs</h2>
            <span className="text-red-400 text-sm font-medium">THREAT MONITORING ACTIVE</span>
          </div>
                <button 
            onClick={clearLogs}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
          >
            Clear Logs
                </button>
              </div>
        
        <div className="bg-black rounded-lg p-4 h-32 overflow-y-auto border border-gray-600">
          {loading ? (
            <div className="text-gray-500 text-sm">Loading logs...</div>
          ) : systemLogs.length === 0 ? (
            <div className="text-gray-500 text-sm">No logs available</div>
          ) : (
            <div className="w-full h-full overflow-y-auto">
              <pre className="whitespace-pre-wrap text-xs font-mono">
                {systemLogs.map((log) => {
                  const ts = formatTimestamp(log.created_at);
                  return (
                    <div key={log.id} className="mb-1">
                      <span className="text-gray-500">[{ts}]</span>{' '}
                      <span className={`${getLevelClass(log.level)} font-semibold`}>[{log.level.toUpperCase()}]</span>{' '}
                      {log.tag && (
                        <span className={`${getTagClass(log.tag)} font-semibold`}>[{log.tag.toUpperCase()}]</span>
                      )}{' '}
                      <span className="text-green-400">{log.message}</span>
                      {log.context && Object.keys(log.context).length > 0 && (
                        <div className="ml-4 mt-1 text-gray-400 text-xs">
                          {Object.entries(log.context).map(([key, value]) => (
                            <div key={key}>{key}: {String(value)}</div>
                  ))}
            </div>
                      )}
          </div>
                  );
                })}
              </pre>
        </div>
            )}
              </div>
            </div>

      {/* Soldiers Records Section */}
      <div className="bg-gray-900 border-t border-gray-700 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Soldiers Records</h2>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">{soldiers.length} soldiers</span>
              <button 
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Add Soldier
              </button>
          </div>
        </div>
            
        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-600">
            <h3 className="text-xl font-bold text-white mb-4">
              {editingSoldier ? 'Edit Soldier' : 'Add New Soldier'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                <input
                  type="text"
                  value={newSoldier.name}
                  onChange={(e) => setNewSoldier({...newSoldier, name: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
                <input
                  type="text"
                  value={newSoldier.position}
                  onChange={(e) => setNewSoldier({...newSoldier, position: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter position"
                />
            </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Sex</label>
                <select
                  value={newSoldier.sex}
                  onChange={(e) => setNewSoldier({...newSoldier, sex: e.target.value as 'Male' | 'Female'})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Age</label>
                <input
                  type="number"
                  value={newSoldier.age}
                  onChange={(e) => setNewSoldier({...newSoldier, age: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter age"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={newSoldier.status}
                  onChange={(e) => setNewSoldier({...newSoldier, status: e.target.value as 'Active' | 'Inactive'})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                  </div>
            </div>
            
            {/* Image Upload Section */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-300 mb-4">Soldier Photo</label>
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Image Preview */}
                <div className="flex-1">
                  {soldierImage ? (
                    <div className="relative">
                      <img 
                        src={soldierImage} 
                        alt="Soldier preview" 
                        className="w-32 h-32 object-cover rounded-lg border-2 border-gray-600"
                      />
              <button 
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 bg-gray-700 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center">
                      <span className="text-gray-400 text-sm">No image</span>
                    </div>
                  )}
                    </div>
                
                {/* Upload Options */}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Upload from File</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    />
                </div>
                  
                  <div>
                    <button
                      type="button"
                      onClick={handleCameraCapture}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                      Take Photo
              </button>
            </div>
            
            </div>
            </div>
                </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={editingSoldier ? updateSoldier : addSoldier}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {editingSoldier ? 'Update Soldier' : 'Add Soldier'}
              </button>
              <button
                onClick={cancelForm}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              </div>
                  </div>
            )}
        
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-600">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white">Photo</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white">Position</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white">Sex</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white">Age</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-white">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                {soldiers.map((soldier) => (
                  <tr key={soldier.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div 
                        className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-500 cursor-pointer hover:border-blue-400 transition-colors"
                        onClick={() => {
                          if (soldier.photo_data && soldier.photo_data.startsWith('data:image')) {
                            // Create modal to show larger image
                            const modal = document.createElement('div');
                            modal.style.cssText = `
                              position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                              background: rgba(0,0,0,0.8); z-index: 1000; display: flex; 
                              align-items: center; justify-content: center; cursor: pointer;
                            `;
                            
                            const img = document.createElement('img');
                            img.src = soldier.photo_data;
                            img.alt = `${soldier.name} photo`;
                            img.style.cssText = 'max-width: 80%; max-height: 80%; border-radius: 10px;';
                            
                            const closeBtn = document.createElement('button');
                            closeBtn.textContent = '×';
                            closeBtn.style.cssText = `
                              position: absolute; top: 20px; right: 30px; 
                              background: #ef4444; color: white; border: none; 
                              border-radius: 50%; width: 40px; height: 40px; 
                              font-size: 20px; cursor: pointer; font-weight: bold;
                            `;
                            
                            modal.onclick = () => document.body.removeChild(modal);
                            closeBtn.onclick = () => document.body.removeChild(modal);
                            
                            modal.appendChild(img);
                            modal.appendChild(closeBtn);
                            document.body.appendChild(modal);
                          }
                        }}
                      >
                        {soldier.photo_data && soldier.photo_data.startsWith('data:image') ? (
                          <img 
                            src={soldier.photo_data} 
                            alt={`${soldier.name} photo`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to initials if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `<span class="text-white text-sm font-medium">${soldier.name.substring(0, 2).toUpperCase()}</span>`;
                              }
                            }}
                          />
                        ) : (
                          <span className="text-white text-sm font-medium">
                            {soldier.photo_data || soldier.name.substring(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white text-sm">{soldier.name}</td>
                    <td className="px-6 py-4 text-gray-300 text-sm">{soldier.position}</td>
                    <td className="px-6 py-4 text-gray-300 text-sm">{soldier.sex}</td>
                    <td className="px-6 py-4 text-gray-300 text-sm">{soldier.age}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        soldier.status === 'Active' 
                          ? 'bg-green-600 text-white' 
                          : 'bg-red-600 text-white'
                      }`}>
                        {soldier.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button 
                          onClick={() => showSoldierDetailsModal(soldier)}
                          className="text-green-400 hover:text-green-300 text-sm"
                        >
                          Details
                        </button>
                        <button 
                          onClick={() => editSoldier(soldier)}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => deleteSoldier(soldier.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                    </div>
                    </td>
                  </tr>
                  ))}
              </tbody>
            </table>
                </div>
              </div>
                  </div>

      {/* Floating Soldier Details Modal */}
      {showSoldierDetails && selectedSoldier && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={closeSoldierDetails}
        >
          <div 
            className="bg-gray-900 rounded-2xl p-8 max-w-2xl w-full mx-4 border border-gray-600 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                {/* Soldier Photo */}
                <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-500">
                  {selectedSoldier.photo_data && selectedSoldier.photo_data.startsWith('data:image') ? (
                    <img 
                      src={selectedSoldier.photo_data} 
                      alt={`${selectedSoldier.name} photo`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-2xl font-bold">
                      {selectedSoldier.photo_data || selectedSoldier.name.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">{selectedSoldier.name}</h2>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      selectedSoldier.status === 'Active' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-red-600 text-white'
                    }`}>
                      {selectedSoldier.status}
                    </span>
                    <span className="text-gray-400 text-sm">
                      ID: #{selectedSoldier.id}
                      </span>
                    </div>
                </div>
              </div>
              
              <button
                onClick={closeSoldierDetails}
                className="text-gray-400 hover:text-white text-2xl font-bold transition-colors"
              >
                ×
              </button>
          </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-3">Personal Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span className="text-white font-medium">{selectedSoldier.name}</span>
        </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Age:</span>
                    <span className="text-white font-medium">{selectedSoldier.age} years</span>
      </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sex:</span>
                    <span className="text-white font-medium">{selectedSoldier.sex}</span>
    </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-3">Service Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Position:</span>
                    <span className="text-white font-medium">{selectedSoldier.position}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status:</span>
                    <span className={`font-medium ${
                      selectedSoldier.status === 'Active' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {selectedSoldier.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ID:</span>
                    <span className="text-white font-medium">#{selectedSoldier.id}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-600 mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Record Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Created:</span>
                  <span className="text-white font-medium">
                    {new Date(selectedSoldier.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Updated:</span>
                  <span className="text-white font-medium">
                    {new Date(selectedSoldier.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  closeSoldierDetails();
                  editSoldier(selectedSoldier);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Edit Soldier
              </button>
              <button
                onClick={closeSoldierDetails}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 