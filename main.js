
var roomDirector = require("roomDirector")
var taskDirector = require("taskDirector")
var employers = require("employers")
require("sprintf")
 
var _ = require("lodash")

Memory.targetPeople = Memory.targetPeople || 18
Memory.scouts = Memory.scouts || {}
Memory.sources = Memory.sources || {}

Memory.guards = Memory.guards || {}
Memory.hostiles = Memory.hostiles || []

for (let roomName in Memory.rooms) delete Memory.rooms[roomName].numCreeps


module.exports.loop = function () {
	//*
    for (let roomName in Game.rooms) {
		room = Game.rooms[roomName]
		room.memory.people = room.memory.people || room.memory.creeps
		room.memory.creeps = undefined
	}
	
	//taskDirector.start()
	
    // Check for dead people
    for (let name in Memory.creeps) {
        if (Game.creeps[name] == undefined) {
			clearDeadPeople()
			break
        }
    }
	
	if (Game.time % 10 == 0){
		Memory.targetPeople = 18
		validateRarely()
	}
	
	for (let personName in Game.creeps) {
		Game.creeps[personName].validate()
	}
	
	for (let roomName in Memory.scouts) {
		let scout = Game.creeps[Memory.scouts[roomName]]
		//console.log("DEBUG: typeof scout = "+typeof scout+" "+scout.name)
		if (typeof scout == "object" && scout.ticksToLive < 300){
			//console.log("DEBUG: retire "+scout.name+" from scouting duty.")
			Memory.scouts[roomName] = "none"
		}
	}
    
	for (i=0; i<Memory.hostiles.length; i++){
		let personID = Memory.hostiles[i]
		let person = Game.getObjectById(personID)
		if (!person){
			console.log("DEBUG: No longer tracking hostile "+personID+".")
			_.pull(Memory.hostiles, personID)
		}
	}
    for (let roomName in Game.rooms) {
		let room = Game.rooms[roomName]
		let roomHostiles = room.find(FIND_HOSTILE_CREEPS)
		room.memory.numHostiles = roomHostiles.length
		
		for (i=0; i<roomHostiles.length; i++){
			if (!Memory.hostiles.includes(roomHostiles[i].id)){
				Memory.hostiles.push(roomHostiles[i].id)
			}
		}
		
		
		if (!room.controller.my) continue
		
		room.doLinks()
		room.doTasks()
		room.doSpawns()
		
		if (room.memory.repairTowerID == undefined) {
			room.findRepairTower()
		}
		
		if (room.memory.numHostiles > 0){
			room.towerAttack()
		} else {
			room.repairWithTowers()
		}
	}
	//*/
}


function clearDeadPeople(){
	//console.log("DEBUG:  Person died.")
    for (let personName in Memory.creeps) {
        if (Game.creeps[personName] == undefined) {
			let personMemory = Memory.creeps[personName]
			let homeRoom = Game.rooms[personMemory.homeRoomName]
			//console.log("DEBUG: "+personName+" died, removing task "+personMemory.task+" from room "+personMemory.homeRoomName+".")
			homeRoom.unassignTask(personName, personMemory.task)
			if (personMemory.jobType != "recycle"){
				console.log("DEBUG: "+personName+" died, removing job "+personMemory.jobType+" from room "+personMemory.homeRoomName+".")
			}
			homeRoom.unassignJob(personName, personMemory.jobType)
        }
    }
	for (let roomName in Game.rooms) {
		if (!Game.rooms[roomName].controller.my) continue
		
		let room = Game.rooms[roomName]
		let people = room.memory.people
		for (i=0; i<people.length; i++){
			let personName = room.memory.people[i]
			//console.log("TRACE: room.memory.people["+i+"]="+room.memory.people[i])
			if (Game.creeps[personName] == undefined) {
				//console.log("DEBUG: "+personName+" died, removing from room "+roomName+".")
				people[i] = null
			}
		}
		room.memory.people = _.compact(people)
	}
	for (let roomName in Memory.scouts){
		let person = Game.creeps[Memory.scouts[roomName]]
		if (Memory.scouts[roomName] != "none" && person == undefined){
			console.log("INFO: removed scout: "+Memory.scouts[roomName])
			Memory.scouts[roomName] = "none"
		}
		if (person && person.memory.jobType != "scout"){
			console.log("WARN: scout "+person.name+" has job "+person.memory.jobType)
			person.setJob("scout", true)
			person.setTask()
		}
	}
	validateRarely()
	for (let personName in Memory.creeps) {
		if (Game.creeps[personName] == undefined) {
			delete Memory.creeps[personName]
		}
	}
}

function validateRarely(){
	for (let roomName in Game.rooms) {
		let room = Game.rooms[roomName]
		if (!room) continue
		// find repair tower
		if (room.controller.my){
			room.findRepairTower()
		}
		
		
		if (room.memory.people){
			// validate task list
			let numDoingTask = {}
			let numDoingJob = {}
			let numAtSource = {}
			for (let taskName in taskDirector.tasks){
				numDoingTask[taskName] = 0
			}
			for (let jobName in Memory.defaultJobPriorities){
				numDoingJob[jobName] = 0
			}
			for (i=0; i<room.memory.people.length; i++){
				let person = Game.creeps[room.memory.people[i]]
				if (person) {
					numDoingTask[person.getTask()] += 1
					numDoingJob[person.getJob()] += 1
					if (person.getTask() == "farHarvest"){
						numAtSource[person.targetID] += 1
					}
				}
			}
			for (let taskName in numDoingTask){
				if (numDoingTask[taskName] != room.memory.taskCount[taskName]){
					console.log("WARN: "+numDoingTask[taskName]+" workers counted for "+taskName+" task, but "+room+" believes there are "+room.memory.taskCount[taskName]+".")
					room.memory.taskCount[taskName] = numDoingTask[taskName]
				}
			}
			for (let jobName in numDoingJob){
				if (numDoingJob[jobName] != room.getJobCount(jobName)){
					console.log("WARN: "+numDoingJob[jobName]+" workers counted for "+jobName+" job, but "+room+" believes there are "+room.getJobCount(jobName)+".")
					room.setJobCount(jobName, numDoingJob[jobName])
				}
			}
			
			
		}
	}
	
	// remove scout flags
	for (let roomName in Memory.scouts){
		if (!Game.flags["Scout"+roomName]){
			delete Memory.scouts[roomName]
			console.log("INFO: removed scout flag: "+roomName)
		}
	}
	
	// validate scouts list
	for (let roomName in Memory.scouts) {
		if (Memory.scouts[roomName] != "none") {
			let scout = Game.creeps[Memory.scouts[roomName]]
			if (typeof scout != "object") {
				//console.log("INFO: scout missing from: "+roomName)
				Memory.scouts[roomName] = "none"
			}
		}
	}
	
	// discover scout flags
	for (let flagName in Game.flags) {
		if (flagName.includes("Scout")){
			let roomName = flagName.replace("Scout", "")
			Memory.scouts = Memory.scouts || {}
			//console.log("TRACE: Memory.scouts["+roomName+"]="+Memory.scouts[roomName])
			if (Memory.scouts[roomName] == undefined) {
				console.log("INFO: discovered scout flag in room "+roomName)
				let room = Game.flags[flagName].room
				let createScout = (room == undefined)
				if (room){
					let scoutsInRoom = room.find(FIND_MY_CREEPS, {filter: (o) =>
						   o.getJob() == "scout"
						&& o.memory.targetRoom == roomName
					})
					if (scoutsInRoom.length == 0) {
						createScout = true
					} else {
						createScout = false
						Memory.scouts[roomName] = scoutsInRoom[0]
						console.log("INFO:   recognized scout "+scoutsInRoom[0].name)
					}
				}
				if (createScout){
					Memory.scouts[roomName] = "none"
				}
			}
		}
	}
	
	// discover harvest flags
	for (let flagName in Game.flags) {
		if (flagName.includes("Harvest")){
			let room = Game.flags[flagName].room
			if (room && room.find(FIND_SOURCES).length > 0) {
				room.countHarvestSpots()
			}
		}
	}
	
	/*
	for (let sourceID in Memory.sources) {
		if (Memory.sources[sourceID].numHarvesters > 0) {
			
		}
	}
	*/
}

Creep.prototype.validate = function() {
	if (typeof Game.rooms[this.memory.homeRoomName] != "object") {
		this.memory.homeRoomName = this.room.name
	}
	let homeRoom = Game.rooms[this.memory.homeRoomName]
	if (! _.includes(homeRoom.memory.people, this.name)) {
		homeRoom.memory.people.push(this.name)
	}
	//console.log("TRACE: "+this.name+" room controller: "+this.memory.homeRoom.controller.my)
	if (homeRoom.controller.my != true) {
		for (let spawnName in Game.spawns) {
			this.memory.homeRoomName = Game.spawns[spawnName].room.name
			break
			//console.log("TRACE: "+spawnName+" room="+Game.spawns[spawnName].room)
		}
	}
}

StructureSpawn.prototype.resetAll = function(){
	for (let sourceID in Memory.sources) {
		Memory.sources[sourceID].numHarvesters = 0
	}
    for (let roomName in Game.rooms) {
		Game.rooms[roomName].resetAll()
    }
	return OK
}

Room.prototype.resetAll = function(){
	if (this.controller.my){
		this.setJobLimits()
		this.setTaskLimits()
		this.setWallMax()
		this.resetPeople()
	}
	return OK
}

Room.prototype.resetPeople = function(){
    //console.log("DEBUG:  "+this.name+".resetPeople()")
    
    for (let i=0; i<this.memory.people.length; i++) {
		let personName = this.memory.people[i]
		let person = Game.creeps[personName]
        if (person == undefined){
            console.log("Person "+personName+" is undefined!")
			clearDeadPeople()
        } else {
			if (this.memory.isGrowing && person.getJob() == "normal") {
				person.setJob("grow")
			}else if (!this.memory.isGrowing && person.getJob() == "grow"){
				person.setJob("normal")
			}else{
				person.setJob()
			}
			person.setTask()
		}
    }
}
