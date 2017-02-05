var _ = require("lodash")
var roomDirector = require("roomDirector")
var taskDirector = require("taskDirector")
var employers = require("employers")
require("sprintf")
let log = require("logger")
log.setLevel(levelType.LEVEL_DEBUG)

Memory.scouts = Memory.scouts || {}
Memory.sources = Memory.sources || {}

Memory.guards = Memory.guards || {}
Memory.hostiles = Memory.hostiles || []

Memory.hour = Memory.hour || new Date().getHours()
Memory.log = Memory.log || ""

let stopAllScripts = false

// Delays in ticks
let validateDelay = 10
let energyCheckDelay = 10
let assetCheckDelay = 60
let historyDelay = 10

module.exports.loop = function () {
	if (stopAllScripts) return
	
    for (let roomName in Game.rooms) {
		room = Game.rooms[roomName]
		room.memory.people = room.memory.people || room.memory.creeps || {}
	}
	
	//taskDirector.start()
	
    // Check for dead people
    for (let name in Memory.creeps) {
        if (Game.creeps[name] == undefined) {
			clearDeadPeople()
			break
        }
    }
	
	if (Game.time % validateDelay == 0){
		validateRarely()
	}
	
	if (Game.time % energyCheckDelay == 0){
		rememberSourceData()
	}
	
	if (Game.time % assetCheckDelay == 0){
		rememberAssets()
	}
	
	if (Game.time % historyDelay == 0){
		let hour = new Date().getHours()
		if (hour != Memory.hour){
			Memory.hour = hour
			printStatistics()
		}		
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
		
		for (i=0; i<roomHostiles.length; i++){
			if (!Memory.hostiles.includes(roomHostiles[i].id)){
				Memory.hostiles.push(roomHostiles[i].id)
			}
		}
		
		
		if (!room.controller.my) continue
		
		room.doLinks()
		room.doTasks()
		let result = room.doSpawns()
		
		if (!_.includes([OK, ERR_BUSY, ERR_NOT_ENOUGH_ENERGY], result)){
			console.log("WARN: "+room.name+" doSpawns returned "+result+".")
		}
		
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
}

Room.prototype.validate = function(){
	let room = this
	
	if (room.controller.my){
		room.findRepairTower()
		room.setWallMax()
		room.updateJobs()
	}
	
	if (!room.memory.taskCount) room.resetAll()
		
	if (!room.memory.taskCount) console.log("ERROR: "+room+" has no taskCount array!")
	
	
	if (room.memory.people){
		// validate task list
		let numDoingTask = {}
		let numDoingJob = {}
		/*
		for (let taskName in taskDirector.tasks){
			numDoingTask[taskName] = 0
		}
		*/
		for (let jobName in Memory.defaultJobPriorities){
			numDoingJob[jobName] = 0
		}
		for (i=0; i<room.memory.people.length; i++){
			let person = Game.creeps[room.memory.people[i]]
			if (person) {
				//numDoingTask[person.getTask()] += 1
				numDoingJob[person.getJob()] += 1
			}
		}
		/*
		for (let taskName in numDoingTask){
			if (numDoingTask[taskName] != room.getTaskCount(taskName)){
				console.log("WARN: "+numDoingTask[taskName]+" workers counted for "+taskName+" task, but "+room+" believes there are "+room.getTaskCount(taskName)+".")
				room.setTaskCount(taskName, numDoingTask[taskName])
			}
		}
		*/
		for (let jobName in numDoingJob){
			if (numDoingJob[jobName] != room.getJobCount(jobName)){
				//console.log("WARN: "+numDoingJob[jobName]+" workers counted for "+jobName+" job, but "+room+" believes there are "+room.getJobCount(jobName)+".")
				room.setJobCount(jobName, numDoingJob[jobName])
			}
		}
	}
}

Room.prototype.updateJobs = function(){
	let room = this
	room.setJobMax("feed", Math.floor(room.energyCapacityAvailable / 900))
	
	let [energy, energyCapacity] = room.getEnergy()
	let numWorkers = room.countNumWorkers()
	
	if (energyCapacity > 0 && numWorkers > 5 && room.controller.level < 8){
		//*
		log.trace("max upgraders=%s, numWorkers=%s energy=%s/%s",
			Math.max(1, Math.round(0.8 * numWorkers * energy / 1000000)),
			numWorkers,
			energy,
			energyCapacity
		)
		//*/
		
		log.trace("%s upgrade jobs = %s", room, Math.round(2 * energy/energyCapacity))
		room.setJobMax("upgrade", Math.ceil(2 * energy/energyCapacity))
		log.trace("%s upgrade jobs = %s", room, room.getJobMax("upgrade"))
		room.setTaskMax("upgrade", Math.max(1, Math.min(numWorkers, Math.round(0.8 * numWorkers * energy/energyCapacity))))
	}
	
	let maxGuards = room.energyCapacityAvailable < 1800 && 2 || 1
	room.setJobMax("attackMelee", maxGuards)
	room.setJobMax("attackRanged", maxGuards)
	room.setJobMax("heal", maxGuards)
}

Room.prototype.getEnergy = function(){
	let room = this
	let energy = 0
	let energyCapacity = 0
	let storage = room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_STORAGE})
	for (i=0; i<storage.length; i++){
		//log.debug("%s energy=%s energyCapacity=%s", storage[i], storage[i].store[RESOURCE_ENERGY], storage[i].storeCapacity)
		energy += storage[i].store[RESOURCE_ENERGY]
		energyCapacity += storage[i].storeCapacity
	}
	return [energy, energyCapacity]
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
			if (this.memory.isGrowing && person.getJob() == "normal") {
				person.setJob("grow")
			}else if (!this.memory.isGrowing && person.getJob() == "grow"){
				person.setJob("normal")
			}else{
				person.setJob()
			}
		}
    }
}


//
// Statistics
//

printStatistics = function(){
	log.info("Total Assets = %s", getTotalAssets())
	printAssetStatistics(60)
	let energyStatistics = getEnergyStatistics()
	log.info("Energy over %.2d minutes - average=%s min=%s max=%s",
		energyStatistics.minutes,
		energyStatistics.average,
		energyStatistics.minimum,
		energyStatistics.maximum
	)
}

getEnergyStatistics = function(){
	if (!Memory.sourceEnergyAvailable) {
		rememberSourceData()
	}
	
	let sum = 0
	let minEnergy = 99999999
	let maxEnergy = -1
	for (i=0; i<Memory.sourceEnergyAvailable.length; i++){
		sum += Memory.sourceEnergyAvailable[i]
		if (Memory.sourceEnergyAvailable[i] > maxEnergy) maxEnergy = Memory.sourceEnergyAvailable[i]
		if (Memory.sourceEnergyAvailable[i] < minEnergy) minEnergy = Memory.sourceEnergyAvailable[i]
	}
	let statistics = {
		minutes: energyCheckDelay * Memory.sourceEnergyAvailable.length / 60,
		average: sum / Memory.sourceEnergyAvailable.length,
		minimum: minEnergy,
		maximum: maxEnergy
	}
	return statistics
}

printAssetStatistics = function(numMinutes){
	if (!Memory.totalAssets) {
		rememberAssets()
	}
	
	let sum = 0
	let min = 99999999
	let max = -1
	for (i=0; i<Memory.totalAssets.length; i++){
		sum += Memory.totalAssets[i]
		if (Memory.totalAssets[i] > max) max = Memory.totalAssets[i]
		if (Memory.totalAssets[i] < min) min = Memory.totalAssets[i]
	}
	let minutes = numMinutes || 30
	let rangeToCompare = minutes * 60/assetCheckDelay
	
	let startIndex = Memory.totalAssetsIndex - rangeToCompare
	let startValue = Memory.totalAssets[(startIndex >= 0) && startIndex || startIndex + Memory.totalAssets.length]
	let endValue = Memory.totalAssets[Memory.totalAssetsIndex]
	
	let income = endValue - startValue
	let statistics = {
		average: sum / Memory.totalAssets.length,
		minimum: min,
		maximum: max,
		income: income,
	}
	log.info("Average of %.2d profit/hour over the past %.2d minutes (from %s to %s energy).",
		60 * statistics.income / minutes,
		minutes,
		startValue,
		endValue
	)
	//console.log(sprintf("INFO: assets over %.2d minutes - average=%s min=%s max=%s", assetCheckDelay * Memory.sourceEnergyAvailable.length / 60, statistics.average, statistics.minimum, statistics.maximum))
	return statistics
}


controllerPreviousCost = [
	0			,
	200			,
	45000		,
	135000		,
	405000		,
	1215000		,
	3645000		,
	10935000	,
]

controllerPreviousTotalCost = [
	0			,
	200			,
	45200		,
	180200		,
	585200		,
	1800200		,
	5445200		,
	16380200	,
]

function rememberAssets(){
	let totalAssets = getTotalAssets()
	if (!Memory.totalAssets){
		Memory.totalAssets = Array(61).fill(totalAssets)
		Memory.totalAssetsIndex = -1
	}
	Memory.totalAssetsIndex = (1 + Memory.totalAssetsIndex) % Memory.totalAssets.length
	Memory.totalAssets[Memory.totalAssetsIndex] = totalAssets
}

function getTotalAssets(){
	let energy = 0
    for (let roomName in Game.rooms) {
		let room = Game.rooms[roomName]
		if (room) {
			energy += room.getRoomAssets()
		}
	}
	return energy
}

Room.prototype.getRoomAssets = function(){
	let room = this
	if (!room.controller.my) return 0
	
	let energy = 0
	
	energy += room.controller.progress + controllerPreviousTotalCost[room.controller.level]
	
	let storage = room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_STORAGE})
	for (i=0; i<storage.length; i++){
		energy += storage[i].store[RESOURCE_ENERGY]
	}
	
	let walls = room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART})
	for (i=0; i<walls.length; i++){
		energy += walls[i].hits / 100
	}
	
	return Math.round(energy)
}

getWallEnergy = function(roomName){
	let room = Game.rooms[roomName]
	if (!room) return room
	
	let energy = 0
	
	let walls = room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART})
	for (i=0; i<walls.length; i++){
		energy += walls[i].hits / 100
	}
	
	return energy
}

function rememberSourceData(){
	let currentEnergy = 0
	let harvestSpots = 0
	for (let sourceID in Memory.sources){
		let source = Game.getObjectById(sourceID)
		if (source) {
			currentEnergy += source.energy
			harvestSpots += source.maxHarvesters - source.numHarvesters
		}
	}
	if (!Memory.sourceEnergyAvailable){
		Memory.sourceEnergyAvailable = Array(50).fill(currentEnergy)
		Memory.energyAvailableIndex = -1
	}
	Memory.energyAvailableIndex = (1 + Memory.energyAvailableIndex) % Memory.sourceEnergyAvailable.length
	Memory.sourceEnergyAvailable[Memory.energyAvailableIndex] = currentEnergy
}

function clearDeadPeople(){
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
