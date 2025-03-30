import { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "./BabylonScene.css"
import EditBar from "../editBar/EditBar";
import { useAppContext } from "../../AppContext";
import earcut from "earcut"

const BabylonScene : React.FC = () => {
    const {mode} = useAppContext(); 
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<BABYLON.Scene | null>(null);
    const cameraRef = useRef<BABYLON.ArcRotateCamera | null>(null);
    const initialCameraState = useRef<{alpha: number; beta: number; radius: number}>({
        alpha: Math.PI/2,
        beta: Math.PI/4,
        radius: 10
    })

    const drawingPoints = useRef<BABYLON.Vector2[]>([]); // Vector3 array to store the points on the canvas
    const shapeMeshRef = useRef<BABYLON.Mesh | null>(null); // Stores closed shapes
    const lineMeshRef = useRef<BABYLON.LinesMesh | null>(null);
    const cursorLineRef = useRef<BABYLON.LinesMesh | null>(null);
    const [isDrawing, setIsDrawing] = useState<boolean>(false);

    useEffect (() => {
        if(canvasRef.current == null ) return;
        // Babylon.js Engine
        const engine = new BABYLON.Engine(canvasRef.current, true);
        const scene = new BABYLON.Scene(engine);

        sceneRef.current = scene;
    
        // Camera [ArcRotateCamera: used to point a target and can be rotate around]
        const camera = new BABYLON.ArcRotateCamera(
            "Camera",
            initialCameraState.current.alpha,
            initialCameraState.current.beta,
            initialCameraState.current.radius,
            BABYLON.Vector3.Zero(),
            scene
        );
        camera.attachControl(canvasRef.current, true); // user can interact with the camera using mouse inputs.
        
        // diable Zoom scroll
        camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
        cameraRef.current = camera;

        // Light
        const light = new BABYLON.HemisphericLight(
            "Light",
            new BABYLON.Vector3(1,1,0),
            scene
        )
        light.intensity = 0.7;
    
        // Ground Plane
        const ground = BABYLON.MeshBuilder.CreateGround(
            "ground",
            {width: 10, height: 10},
            scene
        );
    
        // Set Ground Material
        const groundMaterial = new BABYLON.StandardMaterial(
            "ground",
            scene
        );
        groundMaterial.diffuseColor = new BABYLON.Color3(0.5,0.5,0.5);
        ground.material = groundMaterial;

        // Adding axis to origin
        BABYLON.MeshBuilder.CreateLines("xAxis", {
            points: [BABYLON.Vector3.Zero(), new BABYLON.Vector3(1, 0, 0)],
            colors: [BABYLON.Color4.FromHexString("#FF0000"), BABYLON.Color4.FromHexString("#FF0000")]
        }, scene);
        
        BABYLON.MeshBuilder.CreateLines("yAxis", {
            points: [BABYLON.Vector3.Zero(), new BABYLON.Vector3(0,1,0)],
            colors: [BABYLON.Color4.FromHexString("#00FF00"), BABYLON.Color4.FromHexString("#00FF00")]
        }, scene);

        BABYLON.MeshBuilder.CreateLines("zAxis", {
            points: [BABYLON.Vector3.Zero(), new BABYLON.Vector3(0,0,1)],
            colors: [BABYLON.Color4.FromHexString("#0000FF"), BABYLON.Color4.FromHexString("#0000FF")]
        }, scene);
    
        // Handle window resizing
        window.addEventListener("resize", () => engine.resize()); // Resizes the canvas size dynamically when browser window size changes.
    
        // Render Loop: It continously updates the scene. If removed only initial frame will be shown.
        engine.runRenderLoop(() => {
            scene.render();
        })


        // Scroll event
        const handleScroll = (event: WheelEvent) => {
            event.preventDefault();

            if(event.ctrlKey){
                /* Shift + Scroll to zoom in-out */
                camera.radius *= 1 + event.deltaY * 0.01;
            }
            else if(event.shiftKey){
                /* Ctrl + Scroll to move horizontal  */
                // camera.target.x -= event.deltaY * 0.01;

                // move relative to camera rotation
                const rightVector = camera.getDirection(BABYLON.Axis.X);
                camera.target.addInPlace(rightVector.scale(-event.deltaY*0.01));
            }
            else{
                /* Normal Scroll to move vertical */

                // camera.target.y += event.deltaY * 0.01;
                const upVector = camera.getDirection(BABYLON.Axis.Y);
                camera.target.addInPlace(upVector.scale(event.deltaY*0.01));
            }
        }

        canvasRef.current.addEventListener("wheel", handleScroll);

        // Cleanup : to free up memory by removing the babylon.js engine and scene objects.
        return () => {
            engine.dispose();
            canvasRef.current?.removeEventListener("wheel", handleScroll);
        };
    },[]);

    const resetCamera = () => {
        if(!sceneRef.current) return;

        const camera = sceneRef.current.activeCamera as BABYLON.ArcRotateCamera;
        if(!camera) return;

        // Reset
        camera.alpha = initialCameraState.current.alpha;
        camera.beta = initialCameraState.current.beta;
        camera.radius = initialCameraState.current.radius;
        camera.target = BABYLON.Vector3.Zero();

    }

    // function to switch camera to top-view
    const switchToTopView = (focusPoint: BABYLON.Vector3) => {
        if(!cameraRef.current) return;

        cameraRef.current.alpha = Math.PI/2; // overhead view
        cameraRef.current.beta = 0.01; // look down
        cameraRef.current.radius = 10;
        cameraRef.current.target = focusPoint;

         // Ensure camera updates immediately
        cameraRef.current.rebuildAnglesAndRadius();

    }

    const updateLines = () => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;
    
        // Convert Vector2[] to Vector3[] for rendering
        const linePoints3D = drawingPoints.current.map(p => new BABYLON.Vector3(p.x, 0, p.y));
    
        // Dispose previous lines
        if (lineMeshRef.current) {
            lineMeshRef.current.dispose();
        }
    
        // Create new lines
        lineMeshRef.current = BABYLON.MeshBuilder.CreateLines("drawingLines", { points: linePoints3D }, scene);
    };

    const handleMouseMove = (event: MouseEvent) => {
        if (!isDrawing || drawingPoints.current.length === 0 || !sceneRef.current) return;
        const scene = sceneRef.current;
    
        const pickResult = scene.pick(event.clientX, event.clientY);
        if (pickResult?.pickedPoint) {
            const lastPoint = drawingPoints.current[drawingPoints.current.length - 1];
            const cursorPoint = new BABYLON.Vector2(pickResult.pickedPoint.x, pickResult.pickedPoint.z);
    
            // Convert Vector2 to Vector3 for rendering
            const linePoints3D = [
                new BABYLON.Vector3(lastPoint.x, 0, lastPoint.y),
                new BABYLON.Vector3(cursorPoint.x, 0, cursorPoint.y),
            ];
    
            // Dispose old cursor line
            if (cursorLineRef.current) {
                cursorLineRef.current.dispose();
            }
    
            // Create new cursor-following line
            cursorLineRef.current = BABYLON.MeshBuilder.CreateLines("cursorLine", { points: linePoints3D }, scene,);
        }
    };

    // function to clear canvas
    const clearCanvas = () => {
        if(!sceneRef.current) return;
        const scene = sceneRef.current;

        // Remove previous shapes
        if(shapeMeshRef.current){
            shapeMeshRef.current.dispose();
            shapeMeshRef.current = null;
        }

        // Remove all the previous lines
        if(lineMeshRef.current){
            lineMeshRef.current.dispose();
            lineMeshRef.current = null;
        }

        // Remove all cursor lines
        if(cursorLineRef.current){
            cursorLineRef.current.dispose();
            cursorLineRef.current = null;
        }

        // Remove all the point meshes from the screen
        scene.meshes.forEach(mesh => {
            if(mesh.name.startsWith("points")){
                mesh.dispose();
            }
        })

        // remove the points of array
        drawingPoints.current =[];
    }

    // function to handle draw shap on cliking mouse-left when mode === Draw
    const handleCanvasClick = (event: MouseEvent) => {
        if(mode !== "Draw" || !sceneRef.current) return;

        const scene = sceneRef.current;
        const pickResult = scene.pick(event.clientX, event.clientY); // camera send a invisible ray to the object, and if it hits the object, it will get (true) and the coordinates of hit.

        if(pickResult && pickResult.pickedPoint) {
            let clickedPoint = pickResult.pickedPoint.clone(); // creates a new vector and copies the current vector to it.

            let vector2Point = new BABYLON.Vector2(clickedPoint.x, clickedPoint.z);

            // force y coordinate to zero
            clickedPoint.y = 0;

            // if making the first vertex => set to isDrawing
            if(!isDrawing){
                // drawingPoints.current.splice(0, drawingPoints.current.length);
                // clearCanvas();
                switchToTopView(clickedPoint);
                setIsDrawing(true);
            }

            // drawingPoints.current.push(clickedPoint);
            drawingPoints.current.push(vector2Point);
            updateLines();

            // add a small sphere to make the point visible
            const pointMesh = BABYLON.MeshBuilder.CreateDisc(
                "point",
                {radius: 0.05, tessellation: 16},
                scene
            )
            pointMesh.position = new BABYLON.Vector3(clickedPoint.x, 0.01, clickedPoint.z);

            // rotate the disc slightly upwards
            pointMesh.rotation.x = Math.PI / 2;
            // Parent the point to the ground (prevents floating)
            pointMesh.setParent(scene.getMeshByName("ground"));
            // Add material to make it bold and visible
            const pointMaterial = new BABYLON.StandardMaterial("pointMaterial", scene);
            pointMaterial.diffuseColor = BABYLON.Color3.White(); //Red color
            pointMesh.material = pointMaterial;

            // check if shape is closed
            const points = drawingPoints.current;
            const distanceThreshold = 0.2;

            // If there are more than 2 vertices and the distance b/w 1st and last points is less than threshold, close it
            if(points.length > 2 && BABYLON.Vector2.Distance(points[0], points[points.length-1]) < distanceThreshold){
                alert("shape closed");
                points.pop();
                points.push(points[0]);
                createPolygon(points);
                drawingPoints.current = [];
                setIsDrawing(false);
            }
        }
    }

    // Function to create a polygon
    const createPolygon = (points: BABYLON.Vector2[]) => {
        if(!sceneRef.current) return;

        const scene = sceneRef.current;

        // convet Vectro3 points to Vector2 [Vector2 is required for polygon]
        // Convert Vector2[] to Vector3[] for rendering
        const polygonPoints3D = points.map(p => new BABYLON.Vector3(p.x, 0, p.y));

        console.log("creating polygon", polygonPoints3D);
        // const polygonPoints: BABYLON.Vector2[] = points.map((p) => new BABYLON.Vector2(p.x, p.z)) as BABYLON.Vector2[];

        // Remove the previous shape if exists
        if(shapeMeshRef.current){
            shapeMeshRef.current.dispose();
        }

        // Fill the shape;
        shapeMeshRef.current = BABYLON.MeshBuilder.CreatePolygon("polygon", {shape: polygonPoints3D, depth: 0.01}, scene, earcut);

        // Add material to the shape
        // Add material
        const polygonMaterial = new BABYLON.StandardMaterial("polygonMaterial", scene);
        polygonMaterial.diffuseColor = BABYLON.Color3.Red();
        shapeMeshRef.current.material = polygonMaterial;

        // Remove drawing lines and cursor line
        if (lineMeshRef.current) lineMeshRef.current.dispose();
        if (cursorLineRef.current) cursorLineRef.current.dispose();
    };

    useEffect(() => {
        if(!canvasRef.current) return;

        const canvas = canvasRef.current;
        canvas.addEventListener("click", handleCanvasClick);

        return () => {
            canvas.removeEventListener("click", handleCanvasClick);
        };
    }, [mode]);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
    
        canvas.addEventListener("mousemove", handleMouseMove);
    
        return () => {
            canvas.removeEventListener("mousemove", handleMouseMove);
        };
    }, [isDrawing]);

    return (
        <div className="babylon-scene">
            <div className="reset-camera" onClick={resetCamera}>Reset Camera</div>
            <canvas ref = {canvasRef} style={{width: "100%", height:"100%"}}/>
            <EditBar/>
        </div>
    );
};

export default BabylonScene;