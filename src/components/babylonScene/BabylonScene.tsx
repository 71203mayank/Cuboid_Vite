import { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "./BabylonScene.css"
import EditBar from "../editBar/EditBar";
import { useAppContext } from "../../AppContext";
import earcut from "earcut"
import ObjectEditBar from "../objectEditBar/ObjectEditBar";

const BabylonScene : React.FC = () => {
    const {mode, setMode} = useAppContext(); 
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
    const [selectedShape, setSelectedShape] = useState<BABYLON.Mesh | null>(null);
    const [showExtrudeButton, setShowExtrudeButton] = useState<boolean>(false);
    const [extrudeButtonPosition, setExtrudeButtonPosition] = useState<{x: number, y: number}| null>(null);
    const [extrudeHeight, setExtrudeHeight] = useState<number>(10);

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
    // const clearCanvas = () => {
    //     if(!sceneRef.current) return;
    //     const scene = sceneRef.current;

    //     // Remove previous shapes
    //     if(shapeMeshRef.current){
    //         shapeMeshRef.current.dispose();
    //         shapeMeshRef.current = null;
    //     }

    //     // Remove all the previous lines
    //     if(lineMeshRef.current){
    //         lineMeshRef.current.dispose();
    //         lineMeshRef.current = null;
    //     }

    //     // Remove all cursor lines
    //     if(cursorLineRef.current){
    //         cursorLineRef.current.dispose();
    //         cursorLineRef.current = null;
    //     }

    //     // Remove all the point meshes from the screen
    //     scene.meshes.forEach(mesh => {
    //         if(mesh.name.startsWith("points")){
    //             mesh.dispose();
    //         }
    //     })

    //     // remove the points of array
    //     drawingPoints.current =[];
    // }

    // function to update the selection box
    const updateSelectionBox = (mesh: BABYLON.Mesh) => {
        if (!sceneRef.current) return;

        const scene = sceneRef.current;

        // Get updated bounding box
        const boundingBox = mesh.getBoundingInfo().boundingBox;
        const min = boundingBox.minimumWorld;
        const max = boundingBox.maximumWorld;

        // Create a selection box that includes height
        const boxEdges = [
            // Bottom rectangle
            new BABYLON.Vector3(min.x, min.y, min.z),
            new BABYLON.Vector3(max.x, min.y, min.z),
            new BABYLON.Vector3(max.x, min.y, max.z),
            new BABYLON.Vector3(min.x, min.y, max.z),
            new BABYLON.Vector3(min.x, min.y, min.z),

            // Top rectangle
            new BABYLON.Vector3(min.x, max.y, min.z),
            new BABYLON.Vector3(max.x, max.y, min.z),
            new BABYLON.Vector3(max.x, max.y, max.z),
            new BABYLON.Vector3(min.x, max.y, max.z),
            new BABYLON.Vector3(min.x, max.y, min.z),

            // Vertical edges connecting top and bottom
            new BABYLON.Vector3(min.x, min.y, min.z),
            new BABYLON.Vector3(min.x, max.y, min.z),

            new BABYLON.Vector3(max.x, min.y, min.z),
            new BABYLON.Vector3(max.x, max.y, min.z),

            new BABYLON.Vector3(max.x, min.y, max.z),
            new BABYLON.Vector3(max.x, max.y, max.z),

            new BABYLON.Vector3(min.x, min.y, max.z),
            new BABYLON.Vector3(min.x, max.y, max.z),
        ];

        // Dispose old selection box
        scene.meshes.forEach(item => {
            if (item.name === "selectionBox") {
                item.dispose();
            }
        });

        // Create new selection box
        BABYLON.MeshBuilder.CreateLines("selectionBox", { points: boxEdges }, scene);
    }

    // function to select the object
    const selectObject = (mesh: BABYLON.Mesh) => {
        if(!sceneRef.current) return;

        const scene = sceneRef.current;

        // Remove the old selection box;
        scene.meshes.forEach(item => {
            if(item.name === "selectionBox"){
                item.dispose();
            }
        })

        // enclose the selected shape within a selection box
        updateSelectionBox(mesh);
        
        setSelectedShape(mesh);

        // show extrude button only if the object is still in 2d
        if(mode === "Draw"){
            setShowExtrudeButton(true);

            const boundingBox = mesh.getBoundingInfo().boundingBox;

            // set the extrudeButtonPosition
            // 1. get the center of the bounding box
            const center3D = boundingBox.centerWorld;

            const canvas = scene.getEngine().getRenderingCanvas();
            if(!canvas) return;

            const canvasRect = canvas.getBoundingClientRect();
            if(canvasRect === null) return;

            // 2. convert that 3D world position to 2D screen position
            const center2D = BABYLON.Vector3.Project(
                center3D,
                BABYLON.Matrix.Identity(),
                scene.getTransformMatrix(),
                new BABYLON.Viewport(0,0,canvasRect.width, canvasRect.height)
            )

            setExtrudeButtonPosition({x: center2D.x, y:center2D.y });
        }


        // // enclosing the current shape within a selection box
        // const boundingBox = mesh.getBoundingInfo().boundingBox;
        // const min = boundingBox.minimumWorld;
        // const max = boundingBox.maximumWorld;

        // // create lines
        // const boxEdges = [
        //     new BABYLON.Vector3(min.x, 0.02, min.z),
        //     new BABYLON.Vector3(max.x, 0.02, min.z),
        //     new BABYLON.Vector3(max.x, 0.02, max.z),
        //     new BABYLON.Vector3(min.x, 0.02, max.z),
        //     new BABYLON.Vector3(min.x, 0.02, min.z),
        // ]

        // BABYLON.MeshBuilder.CreateLines("selectionBox", {points: boxEdges}, scene);
        

        // // set the shape selected inside the selection box
        // setSelectedShape(mesh);

        // // set showExtrudeButton => True
        // setShowExtrudeButton(true);

        // // set the extrudeButtonPosition
        // // 1. get the center of the bounding box
        // const center3D = boundingBox.centerWorld;

        // const canvas = scene.getEngine().getRenderingCanvas();
        // if(!canvas) return;

        // const canvasRect = canvas.getBoundingClientRect();
        // if(canvasRect === null) return;

        // // 2. convert that 3D world position to 2D screen position
        // const center2D = BABYLON.Vector3.Project(
        //     center3D,
        //     BABYLON.Matrix.Identity(),
        //     scene.getTransformMatrix(),
        //     new BABYLON.Viewport(0,0,canvasRect.width, canvasRect.height)
        // )

        // setExtrudeButtonPosition({x: center2D.x, y:center2D.y });

        // console.log(center2D);
        // console.log(center2D.x, center2D.y);
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

                if(shapeMeshRef.current !== null){
                    selectObject(shapeMeshRef.current);
                }
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

    const getContoursFromMesh = (mesh: BABYLON.Mesh): BABYLON.Vector2[] => {
        const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    
        if (!positions || positions.length < 6) { // Less than 2 vertices (each needs x, y, z)
            console.error("❌ Invalid contour data. Not enough vertices.");
            return [];
        }
    
        const contours: BABYLON.Vector2[] = [];
    
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2]; // Babylon.js uses X and Z for 2D operations
            contours.push(new BABYLON.Vector2(x, z));
        }
    
        console.log("✅ Corrected contours format:", contours);
        return contours;
    };

    // function to handle extrude
    const onClickExtrude = () => {
        console.log("clicked extrude button, going to edit mode...")
        if(!selectedShape || !sceneRef.current) return;
        // setMode("Edit");

        // const contours = selectedShape.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        // console.log(contours)
        // if (!contours || contours.length === 0) {
        //     console.error("Cannot extrude: Shape has no valid contour data.", selectedShape);
        //     return;
        // }

        // Convert the mesh vertices to a valid contour format
        const contours = getContoursFromMesh(selectedShape);

        if (contours.length < 3) {
            console.error("❌ Not enough points for extrusion.");
            return;
        }
        console.log("✅ Extruding shape with contours:", contours);

        const scene = sceneRef.current;

        // Remove the 2D shape before creating the 3D shape
        selectedShape?.dispose();

        // Convert 2D shape to points to 3D (Vector3 format)
        const polygonPoints3D = drawingPoints.current.map(p => new BABYLON.Vector3(p.x, 0, p.y));

        // Extrude the shape
        const extrudedMesh = BABYLON.MeshBuilder.ExtrudePolygon(
            "extrudedShape",
            {shape: polygonPoints3D, depth: extrudeHeight},
            scene,
            earcut
        );

        // Assign the new extruded shape as selected
        setSelectedShape(extrudedMesh);

        // Add material to the 3D shape
        const material = new BABYLON.StandardMaterial("extrudedMaterial", scene);
        material.diffuseColor = BABYLON.Color3.Green();
        extrudedMesh.material = material;

        // update selection box to fit the new 3d object
        

        // Switch to Edit mode and show ObjectEditor
        setMode("Edit");
        setShowExtrudeButton(false);

        
        setShowExtrudeButton(false);
    }

    return (
        <div className="babylon-scene">
            <div className="reset-camera" onClick={resetCamera}>Reset Camera</div>
            <canvas ref = {canvasRef} style={{width: "100%", height:"100%"}}/>
            <EditBar/>

            {
                showExtrudeButton && extrudeButtonPosition && (
                    <button 
                    className="edit-button-popup"
                    style={{position: "absolute", left: extrudeButtonPosition.x, top: extrudeButtonPosition.y}}
                    onClick={onClickExtrude}
                    >
                        Extrude
                    </button>
                )
            }

            <ObjectEditBar/>
        </div>
    );
};

export default BabylonScene;