// All entry points share the structural workbench; no separate facade window.
import StructuralWallEditor from './StructuralWallEditor.jsx';
export default function FacadeDesigner({initialWallId,initialFloor=1,onClose,onExit,onCloseLabel='К окнам и дверям'}){
 return <StructuralWallEditor floor={initialFloor} wallId={initialWallId} initialTool="facade" onClose={onExit||onClose} closeLabel={onExit?'На план дома':onCloseLabel}/>;
}
