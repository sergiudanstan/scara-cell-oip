#!/bin/zsh
# Lay out the Dual-SCARA parallel transfer cell with OIP's add-part (every param checked).
# OIP world: metres, +Y up, floor y = 0, belt top y = 0.85, flow toward -Z (rotationY 90 turns +X to -Z).
# Infeed A at x = +0.35, outfeed B at x = -0.35; SCARA 1 & SCARA 2 stand on pedestals along x = 0 between the belts.
set -e
P=${0:A:h}/..
OIP=${OIP:-$HOME/code/_vendor/open-industry-project}
rm -f $P/scene.json $P/project.json; rm -rf $P/parts/oip.*(N)
cd $OIP
add() { npm run -s add-part -- $P "$@" | grep -E "^\+|error|✗" || true; }

# Two 4-axis SCARA robots (600 mm reach) reaching toward -Z:
#   robot1 base at (0, 0.85, +0.75) -> pick (+0.35, +0.45), place (-0.35, +0.45)
#   robot2 base at (0, 0.85, -0.15) -> pick (+0.35, -0.45), place (-0.35, -0.45)
R1="commandTag=R1Cmd,executeTag=R1Execute,doneTag=R1Done,busyTag=R1Busy,pointTag=R1Point,vacuumTag=R1Vacuum,vacOkTag=R1VacOk,enableTag=R1Enable,xTag=R1X,zTag=R1Z"
R2="commandTag=R2Cmd,executeTag=R2Execute,doneTag=R2Done,busyTag=R2Busy,pointTag=R2Point,vacuumTag=R2Vacuum,vacOkTag=R2VacOk,enableTag=R2Enable,xTag=R2X,zTag=R2Z"
add $P/parts/scara.transfer-robot --id robot1 --at 0,0.85,0.75 --rot 0 --params "$R1"
add $P/parts/scara.transfer-robot --id robot2 --at 0,0.85,-0.15 --rot 0 --params "$R2"

BELT="fpmUnits=false,standHeight=0.85,friction=0.4,beltColor=#3a5a46"
# Infeed A1 (accumulation), Station 1 pick belt A2 (faster, opens gap + passes cartons to S2), Station 2 pick belt A3
add oip.belt-conveyor --id beltA1 --at 0.35,0.85,2.35 --rot 90 --params "$BELT,segments=[[1.45,0]],width=0.22,speed=0.5,runTag=BeltA1Run"
add oip.belt-conveyor --id beltA2 --at 0.35,0.85,0.90 --rot 90 --params "$BELT,segments=[[0.80,0]],width=0.22,speed=0.75,runTag=BeltA2Run"
add oip.belt-conveyor --id beltA3 --at 0.35,0.85,0.10 --rot 90 --params "$BELT,segments=[[0.85,0]],width=0.22,speed=0.75,runTag=BeltA3Run"
# Outfeed B (carries cartons from both SCARA 1 and SCARA 2 to the despawner)
add oip.belt-conveyor --id beltB  --at -0.35,0.85,0.95 --rot 90 --params "$BELT,segments=[[3.00,0]],width=0.30,speed=0.45,runTag=BeltBRun"

# Escapement blade at A1/A2 junction, pass-through stop at Station 1 (drops to feed S2), fixed end stop at Station 2
add oip.blade-stop --id bladeQ   --at 0.35,0.85,0.90  --rot 90 --params "width=0.22,raiseHeight=0.06,tag=BladeUp"
add oip.blade-stop --id bladeS1  --at 0.35,0.85,0.315 --rot 90 --params "width=0.22,raiseHeight=0.06,tag=BladeS1Up"
add oip.blade-stop --id endStop2 --at 0.35,0.85,-0.585 --rot 90 --params "width=0.22,raiseHeight=0.06,active=true"

# Cartons 250 x 180 x 120 mm, 3 kg; gated by PLC when queue is full
add oip.box-spawner --id feed --at 0.35,1.40,2.15 --rot 90 --params "boxesPerMinute=50,length=0.25,width=0.18,height=0.12,mass=3,boxColor=#c49a6c,runTag=FeedRun,conveyorId=beltA1,keepSpacing=true"
add oip.despawner   --id sink --at -0.35,0.85,-1.90 --rot 90 --params "length=0.30,width=0.40,height=0.40,countTag=Delivered,showReadout=true"

# Photo-eyes across infeed belt A (beam along +X)
EYE="maxRange=0.30"
add oip.diffuse-sensor --id eyeFull  --at 0.21,0.82,1.75  --rot 90 --params "$EYE,tag=EyeFull"
add oip.diffuse-sensor --id eyeHead  --at 0.21,0.82,0.92  --rot 90 --params "$EYE,tag=EyeHead"
add oip.diffuse-sensor --id eyeGate1 --at 0.21,0.82,0.855 --rot 90 --params "$EYE,tag=EyeGate1"
add oip.diffuse-sensor --id eyeZone1 --at 0.21,0.82,0.61  --rot 90 --params "$EYE,tag=EyeZone1"
add oip.diffuse-sensor --id eyeStop1 --at 0.21,0.82,0.365 --rot 90 --params "$EYE,tag=EyeStop1"
add oip.diffuse-sensor --id eyeZone2 --at 0.21,0.82,-0.30 --rot 90 --params "$EYE,tag=EyeZone2"
add oip.diffuse-sensor --id eyeStop2 --at 0.21,0.82,-0.535 --rot 90 --params "$EYE,tag=EyeStop2"

# Photo-eyes across outfeed belt B (drop zone for SCARA 1 + approach & drop zone for SCARA 2)
add oip.diffuse-sensor --id eyeB1a --at -0.53,0.82,0.52  --rot 90 --params "maxRange=0.34,tag=EyeB1a"
add oip.diffuse-sensor --id eyeB1b --at -0.53,0.82,0.35  --rot 90 --params "maxRange=0.34,tag=EyeB1b"
add oip.diffuse-sensor --id eyeB2a --at -0.53,0.82,0.05  --rot 90 --params "maxRange=0.34,tag=EyeB2a"
add oip.diffuse-sensor --id eyeB2b --at -0.53,0.82,-0.15 --rot 90 --params "maxRange=0.34,tag=EyeB2b"
add oip.diffuse-sensor --id eyeB2c --at -0.53,0.82,-0.35 --rot 90 --params "maxRange=0.34,tag=EyeB2c"
add oip.diffuse-sensor --id eyeB2d --at -0.53,0.82,-0.55 --rot 90 --params "maxRange=0.34,tag=EyeB2d"

# Operator control column on the -X side (floor-mounted cabinet + base plate; buttons flush on -X face, stack light on top)
add oip.shape --id panelBase --at -0.85,0,0.36 --params "shape=box,length=0.26,width=0.44,height=0.025,color=#1d2025,solid=false"
add oip.shape --id panel     --at -0.85,0,0.36 --params "shape=box,length=0.16,width=0.34,height=1.35,color=#363b42,solid=false"
add oip.push-button --id estop --at -0.96,1.10,0.44 --rot -90 --params "emergencyStop=true,tag=EStopOk,text=E-STOP"
add oip.push-button --id start --at -0.96,1.10,0.28 --rot -90 --params "tag=StartPB,text=START,buttonColor=#1e8f3a"
add oip.stack-light --id stack --at -0.85,1.35,0.36 --params "tag=StackLight"

# Bind plc/ and tests/ into project.json
python3 - $P/project.json <<'PY'
import json, sys, glob, os
f = sys.argv[1]; p = json.load(open(f)); d = os.path.dirname(f)
q = {k: p[k] for k in ("version", "name", "scene")}
q["program"] = ["plc/program.st"]
t = sorted(os.path.relpath(x, d) for x in glob.glob(os.path.join(d, "tests", "*.test.json")))
if t: q["tests"] = t
q["packages"] = p["packages"]
open(f, "w").write(json.dumps(q, indent=2) + "\n")
PY
