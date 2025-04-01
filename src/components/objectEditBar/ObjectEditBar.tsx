import "./ObjectEditBar.css"
// import { useAppContext } from "../../AppContext";

interface ObjectEditBarProps {
    currentHeight : number;
    onHeightChange: (newHeight: number) => void;
    onExitEditMode: () => void;
}

const ObjectEditBar : React.FC<ObjectEditBarProps> = ({currentHeight, onHeightChange, onExitEditMode}) => {
    // const {setMode} = useAppContext();
    const handleHeightIncrement = () => {
        onHeightChange(currentHeight + 1);
    };

    const handleHeightDecrement = () => {
        onHeightChange(Math.max(0.1, currentHeight - 1));
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        if(isNaN(value) === false && value > 0){
            onHeightChange(value);
        }
    }

    return(
        <div className="object-edit-bar">
            <div className="object-editor-head">
                Edit Mode
                <img src="/cross.svg" className="editor-head-cross" onClick={onExitEditMode}></img>
            </div>
            <div className="object-editor-container">
                <div>
                    <div className="editor-option-heading">
                        Extrusion
                    </div>
                    <div className="editor-action-container">
                        <button className="editor-button" onClick={handleHeightDecrement}>-</button>
                        <input className="editor-input" type="text" value={currentHeight } onChange={handleInputChange} min="0.1" step="0.1"/>
                        <button className="editor-button" onClick={handleHeightIncrement}>+</button>
                    </div>
                </div>
                {/* <div className="vertex-edit-section">
                    <button 
                        className={`vertex-edit-button ${isVertexEditMode ? 'active' : ''}`}
                        onClick={onVertexEditToggle}
                    >
                        {isVertexEditMode ? 'Exit Vertex Edit' : 'Move Vertices'}
                    </button>
                    
                    {isVertexEditMode && (
                        <div className="vertex-edit-hint">
                            Click on any vertex to move it
                        </div>
                    )}
                </div> */}
            </div>
        </div>
    );
};

export default ObjectEditBar;