/// <reference types="vite/client" />

import { FC, useState, useRef, useEffect } from 'react'
import { socketService } from './socket';
import { Hands, Results } from '@mediapipe/hands';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { FaceMesh } from '@mediapipe/face_mesh';
import { supabase, Soldier as SupabaseSoldier, SystemLog as SupabaseSystemLog } from './supabase';

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




const App: FC = () => {
  // Core refs
  const videoeRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handsRef = useRef<Hands | null>(null)
  const poseRef = useRef<Pose | null>(null)
  const faceMeshRef = useRef<FaceMesh | null>(null)
  
  // Camera and detection state
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date());
  
  
  // System state
  const [systemLogs, setSystemLogs] = useState<SupabaseSystemLog[]>([]);
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
  const [currentPage, setCurrentPage] = useState<'surveillance' | 'admin'>('surveillance');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const analyzeHandLandmarks = (landmarks: any) => {
    // Process hand landmarks for ASL recognition
    // This function can be expanded for gesture recognition
    
    // Save system log to database
    saveSystemLog({
      level: 'INFO',
      tag: 'HAND_DETECTION',
      message: `Hand landmarks detected: ${landmarks.length} points`,
      context: {
        landmarksCount: landmarks.length,
        timestamp: new Date().toISOString()
      },
      created_by: 'system'
    });
    
    return null;
  };

  const handleFaceDetected = (faces: any[]) => {
    if (faces && faces.length > 0) {
      console.log('👤 Person detected! Face count:', faces.length);
      setFaceDetected(true);
      
      // Save system log to database
      saveSystemLog({
        level: 'INFO',
        tag: 'FACE_DETECTION',
        message: `Person detected! Face count: ${faces.length}`,
        context: {
          faceCount: faces.length,
          confidence: faces.map(face => face.score || 0),
          timestamp: new Date().toISOString()
        },
        created_by: 'system'
      });
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


      socketService.connect();
      setIsCameraOpen(true);
      
      // Save system log to database
      saveSystemLog({
        level: 'INFO',
        tag: 'CAMERA',
        message: 'Camera started successfully',
        context: { action: 'start' },
        created_by: 'system'
      });
    } catch (error) {
      console.error('Error accessing camera:', error);
      // Save error log to database
      saveSystemLog({
        level: 'ERROR',
        tag: 'CAMERA',
        message: `Camera error: ${error}`,
        context: { error: String(error) },
        created_by: 'system'
      });
    }
  };

  const stopCamera = () => {
    if (videoeRef.current?.srcObject) {
      const stream = videoeRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoeRef.current.srcObject = null;
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
    
    // Save system log to database
    saveSystemLog({
      level: 'INFO',
      tag: 'CAMERA',
      message: 'Camera stopped',
      context: { action: 'stop' },
      created_by: 'system'
    });
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
    const initializeApp = async () => {
      // Load system logs from database
      await loadSystemLogs();
      
      // Load soldiers from database
      await loadSoldiers();
      
      // Add initialization log
      saveSystemLog({
        level: 'INFO',
        tag: 'SYSTEM',
        message: 'Sentinel Command Center initialized',
        context: { version: '1.0.0' },
        created_by: 'system'
      });
      
      setLoading(false);
    };
    
    initializeApp();
  }, []);

  // Auto-poll system logs when on admin page
  useEffect(() => {
    if (currentPage === 'admin') {
      // Start polling every 2 seconds
      const interval = setInterval(() => {
        loadSystemLogs();
      }, 2000);
      setPollingInterval(interval);
      
      return () => {
        clearInterval(interval);
        setPollingInterval(null);
      };
    } else {
      // Clear polling when not on admin page
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [currentPage]);

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

  const clearLogs = async () => {
    try {
      // Clear logs from database
      const { error } = await supabase
        .from('system_logs')
        .delete()
        .neq('id', 0); // Delete all logs

      if (error) throw error;
      
      // Clear local state
      setSystemLogs([]);
      
      // Add clear log to database
      saveSystemLog({
        level: 'INFO',
        tag: 'SYSTEM',
        message: 'System logs cleared',
        context: { action: 'clear' },
        created_by: 'user'
      });
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
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
        
        // Save system log to database
        saveSystemLog({
          level: 'INFO',
          tag: 'SOLDIER_MGMT',
          message: `Soldier added: ${soldierData.name}`,
          context: { action: 'add', soldierName: soldierData.name },
          created_by: 'user'
        });
      } catch (error) {
        console.error('Error adding soldier:', error);
        // Save error log to database
        saveSystemLog({
          level: 'ERROR',
          tag: 'SOLDIER_MGMT',
          message: `Failed to add soldier: ${error}`,
          context: { error: String(error) },
          created_by: 'system'
        });
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
        
        // Save system log to database
        saveSystemLog({
          level: 'INFO',
          tag: 'SOLDIER_MGMT',
          message: `Soldier updated: ${newSoldier.name}`,
          context: { action: 'update', soldierName: newSoldier.name },
          created_by: 'user'
        });
      } catch (error) {
        console.error('Error updating soldier:', error);
        // Save error log to database
        saveSystemLog({
          level: 'ERROR',
          tag: 'SOLDIER_MGMT',
          message: `Failed to update soldier: ${error}`,
          context: { error: String(error) },
          created_by: 'system'
        });
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
      
      // Save system log to database
      saveSystemLog({
        level: 'WARN',
        tag: 'SOLDIER_MGMT',
        message: `Soldier deleted: ${soldier?.name}`,
        context: { action: 'delete', soldierName: soldier?.name },
        created_by: 'user'
      });
    } catch (error) {
      console.error('Error deleting soldier:', error);
      // Save error log to database
      saveSystemLog({
        level: 'ERROR',
        tag: 'SOLDIER_MGMT',
        message: `Failed to delete soldier: ${error}`,
        context: { error: String(error) },
        created_by: 'system'
      });
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

  // Save system log to database
  const saveSystemLog = async (log: Omit<SupabaseSystemLog, 'id' | 'created_at'>) => {
    try {
      const { data, error } = await supabase
        .from('system_logs')
        .insert([log])
        .select();

      if (error) throw error;
      
      // Add to local state
      if (data && data[0]) {
        setSystemLogs(prev => [data[0], ...prev.slice(0, 99)]); // Keep last 100 logs
      }
    } catch (error) {
      console.error('Error saving system log:', error);
    }
  };

  // Load system logs from database
  const loadSystemLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setSystemLogs(data || []);
    } catch (error) {
      console.error('Error loading system logs:', error);
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
      // Save error log to database
      saveSystemLog({
        level: 'ERROR',
        tag: 'SOLDIER_MGMT',
        message: `Failed to load soldiers: ${error}`,
        context: { error: String(error) },
        created_by: 'system'
      });
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
          {/* Navigation Buttons */}
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage('surveillance')}
              className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                currentPage === 'surveillance'
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Surveillance
            </button>
            <button 
              onClick={() => setCurrentPage('admin')}
              className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                currentPage === 'admin'
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Admin Panel
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-green-400">connected</span>
          </div>
          <div className="text-sm text-gray-400">
            {currentTime.toLocaleDateString()}, {currentTime.toLocaleTimeString()}
          </div>
          {currentPage === 'surveillance' && (
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
          )}
          <button className="text-gray-400 hover:text-white transition-colors">
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      {currentPage === 'surveillance' ? (
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

      </div>
      ) : (
        /* Admin Panel */
        <div className="flex-1 flex flex-col">
          {/* System Logs Section */}
          <div className="bg-gray-900 border-t border-gray-700 p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <h2 className="text-lg font-bold text-white">System Logs</h2>
                <span className="text-red-400 text-sm font-medium">LIVE MONITORING</span>
                <span className="text-green-400 text-xs">(Auto-refresh: 2s)</span>
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
                <h3 className="text-lg font-bold text-white mb-4">
                  {editingSoldier ? 'Edit Soldier' : 'Add New Soldier'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
              <input
                      type="text"
                      value={newSoldier.name}
                      onChange={(e) => setNewSoldier({...newSoldier, name: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                      placeholder="Enter soldier name"
                    />
            </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
                    <input
                      type="text"
                      value={newSoldier.position}
                      onChange={(e) => setNewSoldier({...newSoldier, position: e.target.value})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                      placeholder="Enter position"
                    />
          </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Sex</label>
                    <select
                      value={newSoldier.sex}
                      onChange={(e) => setNewSoldier({...newSoldier, sex: e.target.value as 'Male' | 'Female'})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
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
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                      placeholder="Enter age"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                    <select
                      value={newSoldier.status}
                      onChange={(e) => setNewSoldier({...newSoldier, status: e.target.value as 'Active' | 'Inactive'})}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Photo</label>
                    <div className="flex gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="soldier-photo-upload"
                      />
                      <label
                        htmlFor="soldier-photo-upload"
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                      >
                        Upload File
                      </label>
              <button 
                        onClick={handleCameraCapture}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                      >
                        Take Photo
                      </button>
                      {soldierImage && (
                        <button
                          onClick={removeImage}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {soldierImage && (
                      <div className="mt-2">
                        <img
                          src={soldierImage}
                          alt="Soldier preview"
                          className="w-16 h-16 object-cover rounded-lg border border-gray-600"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={editingSoldier ? updateSoldier : addSoldier}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {editingSoldier ? 'Update' : 'Add'} Soldier
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

            {/* Soldiers Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-600">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Photo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Position</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Sex</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Age</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-600">
                    {soldiers.map((soldier) => (
                      <tr key={soldier.id} className="hover:bg-gray-700">
                        <td className="px-6 py-4">
                          {soldier.photo_data ? (
                            <img
                              src={soldier.photo_data}
                              alt={`${soldier.name} photo`}
                              className="w-10 h-10 object-cover rounded-full border border-gray-500"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div 
                            className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold text-sm"
                            style={{ display: soldier.photo_data ? 'none' : 'flex' }}
                          >
                            {soldier.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-white font-medium">{soldier.name}</td>
                        <td className="px-6 py-4 text-gray-300">{soldier.position}</td>
                        <td className="px-6 py-4 text-gray-300">{soldier.sex}</td>
                        <td className="px-6 py-4 text-gray-300">{soldier.age}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                              onClick={() => soldier.id && deleteSoldier(soldier.id)}
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
        </div>
      )}

      {/* Bottom Panel - System Logs (only show on surveillance page) */}
      {currentPage === 'surveillance' && (
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
      )}

      {/* Soldiers Records Section (only show on surveillance page) */}
      {currentPage === 'surveillance' && (
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
      )}

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