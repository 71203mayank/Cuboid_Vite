import "./EditBar.css"
import { useAppContext } from "../../AppContext";
import * as BABYLON from "@babylonjs/core";

interface EditBarOptions {
    mode: "Selector" | "Draw" | "Vertex";
    logo: string;
}

interface EditBarProps{
    shapeMeshRef : BABYLON.Mesh | null;
    vertexEditMode: boolean;
}

const EditBar : React.FC<EditBarProps> = ({shapeMeshRef, vertexEditMode}) => {
    const {mode, setMode} = useAppContext();
    const editBarOptions: EditBarOptions[] = [
        {
            mode: "Selector",
            logo: "/cursor.svg"
        },
        {
            mode: "Draw",
            logo: "/pen.svg"
        },
        {
            mode: "Vertex",
            logo: "/cursor_2.svg"
        },
    ]
    return(
        <div className="edit-bar">
            {editBarOptions.map((item, indx) => (
                <div key = {indx} className={`${mode === item.mode ? "edit-button-active": "edit-button"}`} onClick={() =>{
                    if(mode === "Edit" && item.mode === "Draw"){
                        alert("Please Close the Edit Window!")
                    }
                    if(mode === "Vertex" && vertexEditMode){
                        alert("Save the changes!")
                    }
                    else if(item.mode === "Selector"){
                        setMode("Selector");
                    }
                    else if(item.mode === "Vertex"){
                        if(shapeMeshRef === null){
                            alert("No 3D shape found on the ground");
                        }
                        else{
                            setMode("Vertex")
                        }
                    }
                    else{
                        setMode(item.mode);
                    }
                }}>
                    <img src = {item.logo} className="edit-button-logo"></img>
                </div>
            ))}
        </div>
    );
};

export default EditBar;