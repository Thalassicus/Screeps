Memory.rooms = Memory.rooms || {}
Memory.creeps = Memory.creeps || {}

var _ = require("lodash")
var roomDirector = require("roomDirector")
var taskDirector = require("taskDirector")
var employers = require("employers")
var statistics = require("statistics")
require("sprintf")

let log = require("logger")
log.setLevel(levelType.LEVEL_DEBUG)

Memory.scouts = Memory.scouts || {}
Memory.sources = Memory.sources || {}

Memory.hostiles = Memory.hostiles || []

Memory.log = Memory.log || ""

let stopAllScripts = false

// Delays in ticks
let validateDelay = 10

printStatistics = function(){ return statistics.printStatistics() }

module.exports.loop = function () {
	if (stopAllScripts) return
	
    for (let roomName in Game.rooms) {
		room = Game.rooms[roomName]
		room.memory.people = room.memory.people || room.memory.creeps || {}
	}
	
	//taskDirector.start()
	
    for (let name in Memory.creeps) {
        if (Game.creeps[name] == undefined) {
			clearDeadPeople()
			break
        }
    }
	
	if (Game.time % validateDelay == 0){
		validateRarely()
	}
	
	if (Game.time % statistics.energyCheckDelay == 0){
		statistics.rememberSourceData()
	}
	
	if (Game.time % statistics.assetCheckDelay == 0){
		statistics.rememberAssets()
	}
	
	if (Game.time % statistics.historyDelay == 0){
		statistics.logAll()	
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
			log.info("Defeated hostile %s.", personID)
			_.pull(Memory.hostiles, personID)
		}
	}
    for (let roomName in Game.rooms) {
		let room = Game.rooms[roomName]
		let roomHostiles = room.find(FIND_HOSTILE_CREEPS)
		room.memory.numHostiles = roomHostiles.length
		
		let newHostile = false
		for (i=0; i<roomHostiles.length; i++){
			if (!Memory.hostiles.includes(roomHostiles[i].id)){
				newHostile = true
				Memory.hostiles.push(roomHostiles[i].id)
			}
		}
		if (newHostile){
			log.info("%s hostile(s) appeared in %s.", roomHostiles.length, room.name)
		}
		
		
		if (!room.controller.my) continue
		
		room.doLinks()
		room.doTasks()
		
		if (room.memory.repairTowerID == undefined) {
			room.findRepairTower()
		}
		
		if (room.memory.numHostiles > 0){
			room.towerAttack()
		} else {
			room.repairWithTowers()
		}
		
		//if (Game.time % 1 == 0) log.debug("Controller progress remaining = %s", room.controller.progressTotal - room.controller.progress)
		if (room.memory.level != room.controller.level){
			room.memory.level = room.controller.level
			log.info("%s upgraded to level %s.", room, room.controller.level)
		}
	}
	for (spawnName in Game.spawns){
		let spawn = Game.spawns[spawnName]
		let result = spawn.doSpawns()
		
		if (!_.includes([OK, ERR_BUSY, ERR_NOT_ENOUGH_ENERGY], result)){
			console.log("WARN: "+spawn.name+" doSpawns returned "+result+".")
		}
		
	}
	//*/
}

// 
// Stability
// 

function validateRarely(){
	for (let roomName in Game.rooms) {
		let room = Game.rooms[roomName]
		if (room) room.validate()
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
	
	// validate targetOf list
	for (let targetID in Memory.targetOf){
		let targetArray = Memory.targetOf[targetID]
		for (i=0; i<targetArray.length; i++){
			let task = targetArray[i]
			let isValid = false
			for (let personName in Game.creeps){
				if (targetID == Memory.creeps[personName].targetID){
					isValid = true
					break
				}
			}
			if (!isValid){
				let target = Game.getObjectById(targetID)
				log.debug("%s believes it is targeted for %s, but we found no matches!", target, task)
				if (targetArray){
					_.pull(targetArray, task)
					if (targetArray.length == 0) {
						delete Memory.targetOf[targetID]
					}else{
						Memory.targetOf[targetID] = targetArray
					}
				}
			}
			
		}
	}
	for (let sourceID in Memory.sources) {
		let harvesters = 0
		for (let personName in Game.creeps){
			let person = Game.creeps[personName]
			if (person && person.memory.targetID == sourceID) {
				harvesters += 1
			}
		}
		if (harvesters != Memory.sources[sourceID].numHarvesters){
			//log.debug("Source %s thinks it has %s harvesters, but we counted %s.", sourceID, Memory.sources[sourceID].numHarvesters, harvesters)
			Memory.sources[sourceID].numHarvesters = harvesters
		}
	}
}

Room.prototype.validate = function(){
	let room = this
	
	if (room.controller.my){
		room.findRepairTower()
		room.setWallMax()
		room.calculateJobMaximums()
	}
	
	if (!room.memory.taskCount) room.resetAll()
		
	if (!room.memory.taskCount) console.log("ERROR: "+room+" has no taskCount array!")
	
	
	if (room.memory.people){
		// validate task list
		let numDoingTask = {}
		let numDoingJob = {}
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
			}
		}
		//*
		for (let taskName in numDoingTask){
			if (numDoingTask[taskName] != room.getTaskCount(taskName)){
				//console.log("WARN: "+numDoingTask[taskName]+" workers counted for "+taskName+" task, but "+room+" believes there are "+room.getTaskCount(taskName)+".")
				room.setTaskCount(taskName, numDoingTask[taskName])
			}
		}
		//*/
		for (let jobName in numDoingJob){
			if (numDoingJob[jobName] != room.getJobCount(jobName)){
				//console.log("WARN: "+numDoingJob[jobName]+" workers counted for "+jobName+" job, but "+room+" believes there are "+room.getJobCount(jobName)+".")
				room.setJobCount(jobName, numDoingJob[jobName])
			}
		}
	}
}

Creep.prototype.validate = function() {
	let person = this
	if (typeof Game.rooms[person.memory.homeRoomName] != "object") {
		person.memory.homeRoomName = person.room.name
	}
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (! _.includes(homeRoom.memory.people, person.name)) {
		homeRoom.memory.people.push(person.name)
	}
	//console.log("TRACE: "+person.name+" room controller: "+person.memory.homeRoom.controller.my)
	if (homeRoom.controller.my != true) {
		for (let spawnName in Game.spawns) {
			person.memory.homeRoomName = Game.spawns[spawnName].room.name
			break
		}
	}
	if (homeRoom.memory.isGrowing && person.getJob() == "normal") {
		person.setJob("grow")
	}else if (!homeRoom.memory.isGrowing && person.getJob() == "grow"){
		person.setJob("normal")
	}
}

clearDeadPeople = function(){
	//console.log("DEBUG:  Person died.")
    for (let personName in Memory.creeps) {
        if (Game.creeps[personName] == undefined) {
			let personMemory = Memory.creeps[personName]
			let homeRoom = Game.rooms[personMemory.homeRoomName]
			//console.log("DEBUG: "+personName+" died, removing task "+personMemory.task+" from room "+personMemory.homeRoomName+".")
			homeRoom.unassignTask(personName, personMemory.task)
			//if (!_.includes(["recycle","reserve","scout"], personMemory.jobType))
			//	console.log("DEBUG: "+personName+" died, removing job "+personMemory.jobType+" from room "+personMemory.homeRoomName+".")
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
		}
	}
	validateRarely()
	for (let personName in Memory.creeps) {
		if (Game.creeps[personName] == undefined) {
			delete Memory.creeps[personName]
		}
	}
}

resetAll = function(){
	for (let sourceID in Memory.sources) {
		Memory.sources[sourceID].numHarvesters = 0
	}
    for (let roomName in Game.rooms) {
		Game.rooms[roomName].resetAll()
    }
	return OK
}

Room.prototype.resetAll = function(){
	this.setJobLimits()
	this.setTaskLimits()
	if (this.controller.my){
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
			person.setJob()
		}
    }
}


//
// Statistics
//
