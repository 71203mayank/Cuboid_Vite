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
        alpha: Math.PI / 2,
        beta: Math.PI/2,
        radius: 10
    })

    const drawingPoints = useRef<BABYLON.Vector2[]>([]); // Vector3 array to store the points on the canvas
    const shapeMeshRef = useRef<BABYLON.Mesh | null>(null); // Stores closed shapes
    const lineMeshRef = useRef<BABYLON.LinesMesh | null>(null);
    const cursorLineRef = useRef<BABYLON.LinesMesh | null>(null);
    const pointMeshRef = useRef<BABYLON.Mesh[]>([]);
    const [isDrawing, setIsDrawing] = useState<boolean>(false);
    const [selectedShape, setSelectedShape] = useState<BABYLON.Mesh | null>(null);
    const [showExtrudeButton, setShowExtrudeButton] = useState<boolean>(false);
    const [extrudeButtonPosition, setExtrudeButtonPosition] = useState<{x: number, y: number}| null>(null);
    const [extrudeHeight, setExtrudeHeight] = useState<number>(5);
    const dragBehaviorRef = useRef<BABYLON.PointerDragBehavior | null>(null);

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
            new BABYLON.Vector3(1,1,2),
            scene
        )
        light.intensity = 0.7;
    
        // Ground Plane
        const ground = BABYLON.MeshBuilder.CreateGround(
            "ground",
            {width: 15, height: 15},
            scene
        );
        ground.rotation.x = Math.PI / 2;
        ground.position.z = 0;
    
        // Set Ground Material
        const groundMaterial = new BABYLON.StandardMaterial(
            "ground",
            scene
        );
        groundMaterial.diffuseColor = new BABYLON.Color3(0.5,0.5,0.5);
        // groundMaterial.alpha = 0.5;
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
            clearPoints();
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

    useEffect(() => {
        // Enable/disable drag based on mode
        setupDragBehavior(mode === "Edit");
        
        return () => {
            if (dragBehaviorRef.current && shapeMeshRef.current) {
                shapeMeshRef.current.removeBehavior(dragBehaviorRef.current);
            }
        };
    }, [mode, shapeMeshRef.current]);

    // Edit mode logic
    const enterEditMode = () => {
        setMode("Edit");
        setupDragBehavior(true);
    }

    const exitEditMode = () => {
        setMode("Selector");
        setupDragBehavior(false);
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
        const linePoints3D = drawingPoints.current.map(p => new BABYLON.Vector3(p.x, p.y, 0));
    
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
            const cursorPoint = new BABYLON.Vector2(pickResult.pickedPoint.x, pickResult.pickedPoint.y);
    
            // Convert Vector2 to Vector3 for rendering
            const linePoints3D = [
                new BABYLON.Vector3(lastPoint.x,lastPoint.y, 0 ),
                new BABYLON.Vector3(cursorPoint.x,cursorPoint.y,0),
            ];
    
            // Dispose old cursor line
            if (cursorLineRef.current) {
                cursorLineRef.current.dispose();
            }
    
            // Create new cursor-following line
            cursorLineRef.current = BABYLON.MeshBuilder.CreateLines("cursorLine", { points: linePoints3D }, scene,);
        }
    };

    const showExtrudeButtonAtShapeCenter = (mesh: BABYLON.Mesh, scene: BABYLON.Scene) => {
        if (!mesh) return;
    
        const boundingBox = mesh.getBoundingInfo().boundingBox;
        const center3D = boundingBox.centerWorld;
    
        const canvas = scene.getEngine().getRenderingCanvas();
        if (!canvas) return;
    
        const canvasRect = canvas.getBoundingClientRect();
    
        // Convert 3D world coordinates to 2D screen coordinates
        const center2D = BABYLON.Vector3.Project(
            center3D,
            BABYLON.Matrix.Identity(),
            scene.getTransformMatrix(),
            new BABYLON.Viewport(0, 0, canvasRect.width, canvasRect.height)
        );
    
        // Set the position of the extrude button
        setExtrudeButtonPosition({ x: center2D.x, y: center2D.y });
        setShowExtrudeButton(true);
    };

    const selectShape = (mesh: BABYLON.Mesh | null) => {
        if(!sceneRef.current) return;

        const scene = sceneRef.current;

        // Reset previous selection
        if(selectedShape){
            const mat = selectedShape.material as BABYLON.StandardMaterial;
            if(mat) mat.diffuseColor = BABYLON.Color3.Red();
        }

        // set new select
        setSelectedShape(mesh);
        if(mesh){
            const highlightMaterial = new BABYLON.StandardMaterial("highlight", scene);
            highlightMaterial.diffuseColor = BABYLON.Color3.Green(); // Highlight color
            highlightMaterial.emissiveColor = BABYLON.Color3.Green().scale(0.2);
            mesh.material = highlightMaterial;
        }
    }
    
    // Function to clear pointMeshRef
    const clearPoints = () => {
        if(!sceneRef.current) return;

        // Dispose all the point mesh
        pointMeshRef.current.forEach(mesh => {
            if(mesh && !mesh.isDisposed()){
                mesh.dispose();
            }
        })

        // clear the array
        pointMeshRef.current = [];
    }

    // function to handle draw shap on cliking mouse-left when mode === Draw
    const handleCanvasClick = (event: MouseEvent) => {
        if(!sceneRef.current) return;

        const scene = sceneRef.current;
        const pickResult = scene.pick(event.clientX, event.clientY); // camera send a invisible ray to the object, and if it hits the object, it will get (true) and the coordinates of hit.
        
        if (!pickResult?.pickedPoint) return;

        // Handle Selector mode
        if (mode === "Selector" && pickResult.hit) {
            if (pickResult.pickedMesh === shapeMeshRef.current) {
                selectShape(shapeMeshRef.current);
                enterEditMode();
                return;
            }
        }

        if(mode !== "Draw") return;


        if(pickResult && pickResult.pickedPoint) {
            let clickedPoint = pickResult.pickedPoint.clone(); // creates a new vector and copies the current vector to it.

            let vector2Point = new BABYLON.Vector2(clickedPoint.x, clickedPoint.y);

            // force y coordinate to zero
            clickedPoint.z = 0;

            // if making the first vertex => set to isDrawing
            if(!isDrawing){
                // drawingPoints.current.splice(0, drawingPoints.current.length);
                // clearCanvas();
                // clearPoints();
                switchToTopView(clickedPoint);
                setIsDrawing(true);
            }

            // drawingPoints.current.push(clickedPoint);
            drawingPoints.current.push(vector2Point);
            updateLines();

            // add a small sphere to make the point visible
            // const pointMesh = BABYLON.MeshBuilder.CreateDisc(
            //     "point",
            //     {radius: 0.05, tessellation: 16},
            //     scene
            // )

            const pointMesh = BABYLON.MeshBuilder.CreateSphere("point", {
                diameter: 0.1
            }, scene);
            pointMesh.position = new BABYLON.Vector3(clickedPoint.x, clickedPoint.y, 0.01);

            // rotate the disc slightly upwards
            // pointMesh.rotation.z = -Math.PI / 2;
            // Parent the point to the ground (prevents floating)
            pointMesh.setParent(scene.getMeshByName("ground"));
            // Add material to make it bold and visible
            const pointMaterial = new BABYLON.StandardMaterial("pointMaterial", scene);
            pointMaterial.diffuseColor = BABYLON.Color3.White(); //Red color
            // pointMaterial.disableDepthWrite = true; // This makes the marker always render on top
            pointMesh.material = pointMaterial;
            // pointMesh.renderingGroupId = 1;

            // store the point mesh
            pointMeshRef.current.push(pointMesh);

            // check if shape is closed
            const points = drawingPoints.current;
            const distanceThreshold = 0.2;

            // If there are more than 2 vertices and the distance b/w 1st and last points is less than threshold, close it
            if(points.length > 2 && BABYLON.Vector2.Distance(points[0], points[points.length-1]) < distanceThreshold){
                // alert("shape closed");
                points.pop();
                points.push(points[0]);
                createPolygon(points);
                drawingPoints.current = [];
                // pointMesh.dispose();
                setIsDrawing(false);


                clearPoints();
                // if(shapeMeshRef.current !== null){
                //     selectObject(shapeMeshRef.current);
                // }
                if(shapeMeshRef.current!== null){
                    showExtrudeButtonAtShapeCenter(shapeMeshRef.current, scene)
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
        console.log("points sent", points);
        const polygonPoints3D = points.map(p => new BABYLON.Vector3(p.x, p.y, 0));

        console.log("creating polygon", polygonPoints3D);
        // const polygonPoints: BABYLON.Vector2[] = points.map((p) => new BABYLON.Vector2(p.x, p.z)) as BABYLON.Vector2[];

        // Remove the previous shape if exists
        if(shapeMeshRef.current){
            shapeMeshRef.current.dispose();
        }

        // Fill the shape;
        const polygonBuilder = new BABYLON.PolygonMeshBuilder("polygon", points, scene, earcut);
        // shapeMeshRef.current = BABYLON.MeshBuilder.CreatePolygon("polygon", {shape: polygonPoints3D as BABYLON.Vector3[],depth: 0.01, updatable:true}, scene, earcut);
        shapeMeshRef.current = polygonBuilder.build(false, 0.01);

        console.log("shape:", shapeMeshRef.current);
        shapeMeshRef.current.rotation.x = -Math.PI / 2;
        shapeMeshRef.current.position.z = 0;
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

    

    //function to handle extrude
    const onClickExtrude = () => {
        console.log("clicked extrude button, going to edit mode...")
        // console.log("selecte shape", selectedShape);
        // console.log("selected object", selectObject);

        if (!shapeMeshRef.current || !sceneRef.current) return;

        const scene = sceneRef.current;
        const shapeMesh = shapeMeshRef.current;

        // Get the 2D shape
        const vertexData = shapeMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const shapePoints: BABYLON.Vector3[] = [];

        if (vertexData) {
            for (let i = 0; i < vertexData.length; i += 3) {
                const x = vertexData[i];
                const y = vertexData[i + 1];
                const z = vertexData[i + 2] || 0; // Ensure z exists
                shapePoints.push(new BABYLON.Vector3(x, y, z));
            }
        }

        if(shapePoints.length === 0) return;

        console.log("shapePoints", shapePoints);

        // extrude
        const extrudedMesh = BABYLON.MeshBuilder.ExtrudePolygon(
            "extrudedShape",
            {
                shape: shapePoints,
                depth: 5,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE // Ensure both sides are visible
            },
            scene,
            earcut
        )

        setExtrudeHeight(5);
        // Rotate the extruded shape to aling with the z axis
        extrudedMesh.rotation.x = -Math.PI / 2;
        extrudedMesh.position.y = 0;
        
        // extrudedMesh.position.z = -5;
        const material = new BABYLON.StandardMaterial("polygonMaterial", scene);
        material.diffuseColor = BABYLON.Color3.Red(); // Now it works!
        shapeMesh.material = material;

        // Dispose of the old 2D shape
        shapeMesh.dispose();

        // Store the new extruded shape in the ref
        shapeMeshRef.current = extrudedMesh;

        // Hide the extrude button
        setShowExtrudeButton(false);

        // After extrusion, select the new mesh
        selectShape(extrudedMesh);

        // Switch to Edit Mode
        // setMode("Edit");
        enterEditMode();
    }

    // Function to update extrusion height
    const updateExtrusionHeight = (newHeight: number) => {
        setExtrudeHeight(newHeight);

        // If the mesh already exist, update it
        if(shapeMeshRef.current && mode === "Edit"){
            const scene = sceneRef.current;
            if(!scene) return;

            const vertexData = shapeMeshRef.current.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            const shapePoints: BABYLON.Vector3[] = [];

            if (vertexData) {
                for (let i = 0; i < vertexData.length; i += 3) {
                    const x = vertexData[i];
                    const y = vertexData[i + 1];
                    const z = vertexData[i + 2] || 0;
                    shapePoints.push(new BABYLON.Vector3(x, y, z));
                }
            }

            if (shapePoints.length === 0) return;

            // Dispose old mesh
            shapeMeshRef.current.dispose();

            // Create new mesh with updated height
            const extrudedMesh = BABYLON.MeshBuilder.ExtrudePolygon(
                "extrudedShape",
                {
                    shape: shapePoints,
                    depth: newHeight,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE
                },
                scene,
                earcut
            );

            extrudedMesh.rotation.x = -Math.PI / 2;
            extrudedMesh.position.y = 0;

            const material = new BABYLON.StandardMaterial("polygonMaterial", scene);
            material.diffuseColor = BABYLON.Color3.Red();
            extrudedMesh.material = material;

            shapeMeshRef.current = extrudedMesh;
        }
    };

    // const confirmPositionUpdate = () => {
    //     if (!shapeMeshRef.current) return;
        
    //     // Force React to recognize the reference update
    //     const updatedMesh = shapeMeshRef.current;
    //     shapeMeshRef.current = updatedMesh;
        
    //     // Reapply drag behavior if needed
    //     setupDragBehavior(mode === "Edit");
    // };

    // const confirmPositionUpdate = () => {
    //     if (!shapeMeshRef.current || !wasDragged) return;
        
    //     // Clone the mesh to ensure a fresh reference
    //     const currentMesh = shapeMeshRef.current;
    //     const scene = sceneRef.current;
        
    //     // Create new mesh with current properties
    //     const newMesh = currentMesh.clone("shape-" + Date.now());
    //     newMesh.position = currentMesh.position.clone();
    //     newMesh.rotation = currentMesh.rotation.clone();
    //     newMesh.material = currentMesh.material;
        
    //     // Update the reference
    //     shapeMeshRef.current = newMesh;
        
    //     // Dispose old mesh
    //     currentMesh.dispose();
        
    //     // Reset drag state
    //     setWasDragged(false);
        
    //     // Re-enable drag behavior
    //     setupDragBehavior(true);
    // };

    // Function to enable/disable draggin of 3D objects
    const setupDragBehavior = (enable: boolean) => {
        if(!shapeMeshRef.current || !sceneRef.current) return;

        const mesh = shapeMeshRef.current;
        

        // Remove all existing drag behavior
        if(dragBehaviorRef.current){
            mesh.removeBehavior(dragBehaviorRef.current);
            dragBehaviorRef.current = null;
        }

        if(enable && mode === "Edit") {
            const dragBehavior = new BABYLON.PointerDragBehavior({
                // dragAxis: new BABYLON.Vector3(1,1,0)
                dragPlaneNormal: new BABYLON.Vector3(0, 0, 1)
            });

            dragBehavior.moveAttached = true;
            dragBehavior.useObjectOrientationForDragging = false;
            dragBehavior.updateDragPlane = true;


            // visual feedback
            dragBehavior.onDragStartObservable.add(() => {
                mesh.renderOutline = true;
                mesh.outlineColor = BABYLON.Color3.Green();
                mesh.outlineWidth = 0.1;
                // setWasDragged(false);

                // Important: Update the drag plane to current position
                // dragBehavior.dragPlanePoint = mesh.absolutePosition.clone();
            });

            // dragBehavior.onDragObservable.add(() => {
            //     setWasDragged(true); // Flag that dragging occurred
            // });

            dragBehavior.onDragEndObservable.add(() => {
                mesh.renderOutline = false;

                // updateShapeMeshRef();
                // confirmPositionUpdate();
            });

            // Add to mesh
            mesh.addBehavior(dragBehavior);
            dragBehaviorRef.current = dragBehavior;

             // Enable pointer events
            mesh.enablePointerMoveEvents = true;
        }
    }

    return (
        <div className="babylon-scene">
            <div className="cuboid-logo"><img src='/cuboid.svg' alt='logo'></img></div>
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

            {
                mode == "Edit" && <ObjectEditBar currentHeight={extrudeHeight} onHeightChange={updateExtrusionHeight} onExitEditMode={exitEditMode}/>
            }
            <div className="mode-indicator">Current Mode: {mode}</div>
        </div>
    );
};

export default BabylonScene;