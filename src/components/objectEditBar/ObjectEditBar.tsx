import "./ObjectEditBar.css"

const ObjectEditBar = () => {
    return(
        <div className="object-edit-bar">
            <div className="object-editor-head">Edit Mode</div>
            <div className="object-editor-container">
                <div>
                    <div className="editor-option-heading">Extrusion</div>
                    <div className="editor-action-container">
                        <button className="editor-button">-</button>
                        <input className="editor-input" type="text"/>
                        <button className="editor-button">+</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ObjectEditBar;