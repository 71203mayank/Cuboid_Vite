import "./EditBar.css"
import { useAppContext } from "../../AppContext";

interface EditBarOptions {
    mode: "Selector" | "Draw";
    logo: string;
}

const EditBar : React.FC = () => {
    const {mode, setMode} = useAppContext();
    const editBarOptions: EditBarOptions[] = [
        {
            mode: "Selector",
            logo: "/cursor.svg"
        },
        {
            mode: "Draw",
            logo: "/pen.svg"
        }
    ]
    return(
        <div className="edit-bar">
            {editBarOptions.map((item, indx) => (
                <div key = {indx} className={`${mode === item.mode ? "edit-button-active": "edit-button"}`} onClick={() =>{
                    if(mode === "Edit" && item.mode === "Draw"){
                        alert("Please Close the Edit Window!")
                    }
                    else if(item.mode === "Selector"){
                        setMode("Selector");
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