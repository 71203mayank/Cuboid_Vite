"use client";

import { useEffect, useRef } from "react";
import * as BABYLON from "@babylonjs/core";
import "./BabylonScene.css"
import EditBar from "../editBar/EditBar";

const BabylonScene : React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<BABYLON.Scene | null>(null);
    const initialCameraState = useRef<{alpha: number; beta: number; radius: number}>({
        alpha: Math.PI/2,
        beta: Math.PI/4,
        radius: 10
    })

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

    return (
        <div className="babylon-scene">
            <div className="reset-camera" onClick={resetCamera}>Reset Camera</div>
            <canvas ref = {canvasRef} style={{width: "100%", height:"100%"}}/>
            <EditBar/>
        </div>
    );
};

export default BabylonScene;