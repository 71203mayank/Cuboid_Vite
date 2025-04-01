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
    const cameraRef = useRef<BABYLON.ArcRotateCamera | null>(null); // stores the original camera position.
    const initialCameraState = useRef<{alpha: number; beta: number; radius: number}>({
        alpha: Math.PI / 2,
        beta: Math.PI/2,
        radius: 10
    })
    const drawingPoints = useRef<BABYLON.Vector2[]>([]); // Vector3 array to store the points on the canvas
    const shapeMeshRef = useRef<BABYLON.Mesh | null>(null); // Stores closed shapes
    const lineMeshRef = useRef<BABYLON.LinesMesh | null>(null); // Stores the edges of 2D object while drawing.
    const cursorLineRef = useRef<BABYLON.LinesMesh | null>(null); // Represent the line currently being drawn.
    const pointMeshRef = useRef<BABYLON.Mesh[]>([]); // stores the vertices of the 2D object
    const [isDrawing, setIsDrawing] = useState<boolean>(false);
    const [selectedShape, setSelectedShape] = useState<BABYLON.Mesh | null>(null);
    const [showExtrudeButton, setShowExtrudeButton] = useState<boolean>(false);
    const [extrudeButtonPosition, setExtrudeButtonPosition] = useState<{x: number, y: number}| null>(null);
    const [extrudeHeight, setExtrudeHeight] = useState<number>(5);
    const dragBehaviorRef = useRef<BABYLON.PointerDragBehavior | null>(null);

    const [vertexEditMode, setVertexEditMode] = useState(false);
    const [showSaveButton, setShowSaveButton] = useState(false);
    const vertexSpheres = useRef<BABYLON.Mesh[]>([]);
    const selectedVertexIndex = useRef<number | null>(null);


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

    // Function to reset camera back to its original position
    /* Already have stored the initialCameraState, used that to reset */
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
    // Drag Behavior is enabled only in "Edit Mode"
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

    // Fuction to add new edge while drawing the 2D object.
    /* 
        1. have stored all the vertices of the 2D shape in lineMeshRef.
        2. Taking the new vertices from drawingPoints, making a line and updating my lineMeshRef.
    */
    const updateLines = () => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;
    
        // Convert Vector2[] to Vector3[]
        const linePoints3D = drawingPoints.current.map(p => new BABYLON.Vector3(p.x, p.y, 0));
    
        // Dispose previous lines
        if (lineMeshRef.current) {
            lineMeshRef.current.dispose();
        }
    
        // Create new lines
        lineMeshRef.current = BABYLON.MeshBuilder.CreateLines("drawingLines", { points: linePoints3D }, scene);
    };

    // Function to Handle mouse event for drawing the 2D shape:
    /*
        1. Get the point on the canvas where cursor is present
        2. Get the last vertex pushed into drawingPoints.
        3. Make a line b/w the above two points and assign it to cursorLineRef.
    */
    const handleMouseMove = (event: MouseEvent) => {
        if (!isDrawing || drawingPoints.current.length === 0 || !sceneRef.current) return;
        const scene = sceneRef.current;
        
        // Extract the point where ever mouse cursor is following
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

    // Function to get the center coordiantes of the 2D object for "Extrude" button
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

    // Function to select a 3D shape
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

        // Handle Vertex mode
        if (mode === "Vertex" && pickResult.hit) {
            if (pickResult.pickedMesh === shapeMeshRef.current && shapeMeshRef.current!==null) {
            enableVertexEditMode();
            return;
            }
        }

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
                switchToTopView(clickedPoint);
                setIsDrawing(true);
            }

            // drawingPoints.current.push(clickedPoint);
            drawingPoints.current.push(vector2Point);
            updateLines();
            
            // Create a sphere for the vertex
            const pointMesh = BABYLON.MeshBuilder.CreateSphere("point", {
                diameter: 0.1
            }, scene);
            pointMesh.position = new BABYLON.Vector3(clickedPoint.x, clickedPoint.y, 0.01);

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

                setIsDrawing(false);

                // Removing the vertice after compeletion of 2D object.
                clearPoints();
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
    /*
        1. Get the vertices of the 2D shape and convert into 3D (z = 0)
        2. extrude using inbuilt function "extrudePolygon"
        3. Rotate the extrudedMesh to align with the z axis.
    */
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

        // Bake the transformation into the vertices
        // extrudedMesh.bakeCurrentTransformIntoVertices();
        
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


    // Function to enable/disable dragging of 3D objects
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

    // Function to delete the shape
    const handleDeleteShape = () => {
        if(!sceneRef.current && !shapeMeshRef.current) return;

        shapeMeshRef.current?.dispose();
        shapeMeshRef.current = null;
        setSelectedShape(null);
        setMode("Selector");
    }


    // Function to enable Vertix Edit Mode => It will highligh the vertices of the 3D shape and calls setupVertexDragBehaivor when these vertices are draged.
    const enableVertexEditMode = () => {
        if(!sceneRef.current || !shapeMeshRef.current) return;

        const mesh = shapeMeshRef.current;
        const scene = sceneRef.current;

        // Clear any existing vertex spheres
        disableVertexEditMode();

        // Get vertex positions
        const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        if (!positions) return;

        // Create a rotation matrix for our -PI/2 X-axis rotation
        const rotationMatrix = BABYLON.Matrix.RotationX(-Math.PI/2);
        const vertexCount = positions.length / 3;

        // Create spheres for each vertex
    for (let i = 0; i < positions.length; i += 3) {
        // Get original vertex position
        const originalPosition = new BABYLON.Vector3(
            positions[i],
            positions[i + 1], 
            positions[i + 2]
        );
        
        // Apply the inverse rotation to get the position in world space
        const transformedPosition = BABYLON.Vector3.TransformCoordinates(
            originalPosition, 
            rotationMatrix
        );
        
        // Create sphere at transformed position
        const sphere = BABYLON.MeshBuilder.CreateSphere(
            `vertex-${i}`, 
            { diameter: 0.2 }, 
            scene
        );
        sphere.position = transformedPosition;
        
        // Make spheres pickable
        sphere.isPickable = true;
        
        // Store original vertex index
        sphere.metadata = { originalIndex: i };
        
        // Add click handler
        sphere.actionManager = new BABYLON.ActionManager(scene);
        sphere.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                BABYLON.ActionManager.OnPickTrigger,
                () => {
                    selectedVertexIndex.current = i / 3;
                    setupVertexDragBehavior(sphere, rotationMatrix);
                }
            )
        );
        
        // Style the sphere
        const material = new BABYLON.StandardMaterial("vertex-mat", scene);
        material.diffuseColor = BABYLON.Color3.Yellow();
        sphere.material = material;
        
        vertexSpheres.current.push(sphere);
    }


        // Only create spheres for the base vertices (first half) : But not working :(
        for (let i = 0; i < vertexCount / 2; i++) {
            const originalPos = new BABYLON.Vector3(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2]
            );
            
            const worldPos = BABYLON.Vector3.TransformCoordinates(originalPos, rotationMatrix);
            
            const sphere = BABYLON.MeshBuilder.CreateSphere(
                `vertex-${i}`, 
                { diameter: 0.2 }, 
                scene
            );
            sphere.position = worldPos;
            sphere.isPickable = true;
            sphere.metadata = { 
                originalIndex: i * 3,
                isBaseVertex: true
            };
            
            // Add drag behavior
            const dragBehavior = new BABYLON.PointerDragBehavior();
            dragBehavior.moveAttached = true;

            dragBehavior.onDragObservable.add(() => {
                // Get the current world position of the sphere
                const currentWorldPos = sphere.position.clone();
                
                // Transform back to model space using inverse rotation
                const inverseRotationMatrix = rotationMatrix.clone().invert();
                const modelSpacePos = BABYLON.Vector3.TransformCoordinates(
                    currentWorldPos, 
                    inverseRotationMatrix
                );
                
                // Update the original positions array
                positions[sphere.metadata.originalIndex] = modelSpacePos.x;
                positions[sphere.metadata.originalIndex + 1] = modelSpacePos.y;
                positions[sphere.metadata.originalIndex + 2] = modelSpacePos.z;
                
                // Update the mesh
                mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
                
                // If you need to update normals after vertex movement
                mesh.createNormals(true);
            });
            
            sphere.addBehavior(dragBehavior);
            
            // Style the sphere
            const material = new BABYLON.StandardMaterial("vertex-mat", scene);
            material.diffuseColor = BABYLON.Color3.Yellow();
            sphere.material = material;
            
            vertexSpheres.current.push(sphere);
        }

        setVertexEditMode(true);
        setShowSaveButton(true);
    }

    // Function to disable the vertex edit mode, it deletes all the vertice created and resets the used variables and references.
    const disableVertexEditMode = () => {
        vertexSpheres.current.forEach(sphere => sphere.dispose());
        vertexSpheres.current = [];
        selectedVertexIndex.current = null;
        setVertexEditMode(false);
        setShowSaveButton(false);
    };

    // Function to enable/disable dragging of vertices
    const setupVertexDragBehavior = (sphere: BABYLON.Mesh, rotationMatrix: BABYLON.Matrix) => {
        if (!shapeMeshRef.current || !sceneRef.current) return;
        
        const mesh = shapeMeshRef.current;
        // const scene = sceneRef.current;
        
        const dragBehavior = new BABYLON.PointerDragBehavior({
            dragPlaneNormal: new BABYLON.Vector3(0, 0, 1)
        });
        dragBehavior.moveAttached = true;
        
        dragBehavior.onDragObservable.add(() => {
            if (!sphere.metadata) return;
            const originalIndex = sphere.metadata.originalIndex;
            
            // Get the inverse rotation
            const inverseMatrix = rotationMatrix.clone();
            inverseMatrix.invert();
            
            // Transform the dragged position back to mesh local space
            const localPosition = BABYLON.Vector3.TransformCoordinates(
                sphere.position,
                inverseMatrix
            );
            
            // Update the main mesh vertex position
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            if (!positions) return;
            
            // Update the dragged vertex
            positions[originalIndex] = localPosition.x;
            positions[originalIndex + 1] = localPosition.y;
            positions[originalIndex + 2] = localPosition.z;
            
            // For extruded shapes, find and update the corresponding vertex on the other side
            const totalVertices = positions.length / 3;
            const isTopVertex = originalIndex < totalVertices * 1.5; // Rough heuristic
            const correspondingIndex = isTopVertex 
                ? originalIndex + totalVertices/2 
                : originalIndex - totalVertices/2;
            
            if (correspondingIndex >= 0 && correspondingIndex < totalVertices) {
                // Keep Z position opposite but maintain XY
                positions[correspondingIndex * 3] = localPosition.x;
                positions[correspondingIndex * 3 + 1] = localPosition.y;
                positions[correspondingIndex * 3 + 2] = isTopVertex 
                    ? localPosition.z - extrudeHeight 
                    : localPosition.z + extrudeHeight;
            }
            
            mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
        });
        
        sphere.addBehavior(dragBehavior);
    };
    
    // Saves the modifed object: It creates a whole new 3D object from the new coordinated.
    const saveModifiedShape = () => {
        if (!shapeMeshRef.current || !sceneRef.current) return;
        
        const scene = sceneRef.current;
        const currentMesh = shapeMeshRef.current;
        
        // 1. Get current vertex data
        const positions = currentMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        if (!positions) return;
        
        // 2. Extract just the original base vertices (first half)
        const baseVertices = [];
        const vertexCount = positions.length / 3;
        const baseVertexCount = vertexCount / 2; // For extruded shapes
        
        for (let i = 0; i < baseVertexCount; i++) {
            baseVertices.push(
                new BABYLON.Vector3(
                    positions[i * 3],
                    positions[i * 3 + 1],
                    positions[i * 3 + 2]
                )
            );
        }
        
        // 3. Rebuild the shape from the modified base
        const extrudedMesh = BABYLON.MeshBuilder.ExtrudePolygon(
            "rebuilt-shape",
            {
                shape: baseVertices,
                depth: extrudeHeight,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE
            },
            scene,
            earcut
        );
        
        // 4. Apply original transformations
        extrudedMesh.rotation.x = -Math.PI / 2;
        extrudedMesh.position.copyFrom(currentMesh.position);
        
        // 5. Copy material
        if (currentMesh.material) {
            extrudedMesh.material = currentMesh.material;
        }
        
        // 6. Update reference and clean up
        shapeMeshRef.current = extrudedMesh;
        currentMesh.dispose();
        disableVertexEditMode();

        if(vertexSpheres.current){
            vertexSpheres.current.splice(0, vertexSpheres.current.length);
            vertexSpheres.current = [];
        }
        
        // 7. Return to selector mode
        setMode("Selector");
    };

    return (
        <div className="babylon-scene">
            <div className="cuboid-logo"><img src='/cuboid.svg' alt='logo'></img></div>
            <div className="reset-camera" onClick={resetCamera}>Reset Camera</div>
            <canvas ref = {canvasRef} style={{width: "100%", height:"100%"}}/>
            <EditBar shapeMeshRef={shapeMeshRef.current} vertexEditMode={vertexEditMode}/>

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
                mode == "Edit" && <ObjectEditBar currentHeight={extrudeHeight} onHeightChange={updateExtrusionHeight} onExitEditMode={exitEditMode} onClickDelete={handleDeleteShape}/>
            }
            {showSaveButton && 
                <div className="vertex-edit-dialog">
                    <div className="vertex-edit-heading">Vertex Edit</div>
                    <div className="instruction-container">
                        <div className="instruction-heading">Instructions</div>
                        <div className="instruction-content">Click on any of the base vertices and drag to move it. Click on the 'Save Changes' button to see the updated shape!</div>
                    </div>
                    <div className="instruction-button-container">
                        <button onClick={saveModifiedShape}>
                            Save Changes
                        </button>
                    </div>
                </div>
            }
            <div className="mode-indicator">Current Mode: {mode}</div>
        </div>
    );
};

export default BabylonScene;