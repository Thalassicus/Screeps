let _ = require("lodash")
var jobDirector = require("jobDirector")
var taskDirector = require("taskDirector")
require("sprintf")
let log = require("logger")
log.setLevel(levelType.LEVEL_TRACE)

//console.log("TRACE doSpawns: taskDirector.tasks.reserve.getTarget() = "+taskDirector.tasks.reserve.getTarget())

Memory.retirementAge = 30
let harvestRate = 2
let carryCapacity = 50
let sourceRespawnTime = 300

module.exports = {

};

StructureSpawn.prototype.createPerson = function(jobName, info){
	let room = this.room
	let spawner = this
	let [bodyParts, bodyCost] = room.getBodyParts(jobName)
	let	personName = spawner.createCreep(bodyParts)
	switch (personName){
		case ERR_NOT_ENOUGH_ENERGY:
			break
			
		case ERR_INVALID_ARGS:
			console.log("ERROR createPerson: Invalid body parts for "+jobName+" job:"+bodyParts)
			break
			
		default:
			//console.log("DEBUG createPerson: "+personName+" with "+jobName+" job.")
			break
	}
	
	if (personName < 0) return personName
	
	let person = Game.creeps[personName]
				
	room.memory.people.push(personName)
	person.memory.homeRoomName = person.room.name
	person.memory.bodyCost = bodyCost
	
	if (jobName == "scout"){
		let roomName = info
		Memory.scouts[roomName] = personName
		person.memory.targetRoom = roomName
	}
	if (_.includes(["normal","grow"], jobName)){
		person.setJob(jobName, false)
	}else{
		person.setJob(jobName, true)
	}
	
	return OK
}

StructureSpawn.prototype.doSpawns = function(){
	let spawner = this
	let room = this.room
	
	if (Game.time % 10 == 0){
		if (room.controller.my){
			let [workerParts, workerCost] = room.getBodyParts("normal")
			let workParts = 0
			let carryParts = 0
			for (i=0; i<workerParts.length; i++){
				if (workerParts[i] == WORK) {
					workParts += 1
				}else if (workerParts[i] == CARRY) {
					carryParts += 1
				}
			}
			let travelTime = 50
			let workDivisor = (workParts * harvestRate)

			if (room.controller.level == 1){
				room.memory.maxWorkers = 3 * room.find(FIND_SOURCES).length
			}else{
				let maxWorkers = 3 * room.find(FIND_SOURCES).length
				
				for (let sourceID in Memory.sources) {
					let source = Game.getObjectById(sourceID)
					if (source) {
						maxWorkers += source.energyCapacity / 1500
					}
				}
				room.memory.maxWorkers = Math.round(maxWorkers)
			}
		}else{
			room.memory.maxWorkers = 0
		}
	}
	
	// count workers
	room.memory.people = room.memory.people || []
	let numWorkers = room.getNumWorkers()
	
	if (!spawner) return ERR_NOT_OWNER
	if (room.memory.isGrowing == undefined) room.memory.isGrowing = true
	
	room.checkIsGrowing()
	
	let personName = ""
	
	let recyclePeople = spawner.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (t) => t.getTask() == "recycle"})
	for (i=0; i<recyclePeople.length; i++){
		spawner.recycleCreep(recyclePeople[i])
	}
	
	// stop if we're already spawning something
	if (spawner.spawning) return ERR_BUSY
	
	// count people per job
	let numDoingJob = {}
	for (let jobName in Memory.defaultJobPriorities){
		numDoingJob[jobName] = 0
	}
	for (i=0; i<room.memory.people.length; i++){
		let person = Game.creeps[room.memory.people[i]]
		// ticksToLive is undefined until the tick AFTER a creep leaves the spawner
		if (person && !person.ticksToLive || person.ticksToLive > Memory.retirementAge + 2*person.body.length) {
			numDoingJob[person.getJob()] += 1
		}
	}
	
	// Scouts
	for (let roomName in Memory.scouts) {
		//console.log("TRACE: Memory.scouts["+roomName+"]="+Memory.scouts[roomName])
		
		if (Memory.scouts[roomName] == "none"){
			if (spawner.createPerson("scout", roomName) == OK) return OK
		}
	}
	
	// high priority
	if (room.energyCapacityAvailable >= 550 && !room.memory.isGrowing){
		let jobs = ["feed", "attackRanged", "attackMelee", "heal"]
		for (i=0; i<jobs.length; i++){
			if (numDoingJob[jobs[i]] < room.getJobMax(jobs[i])){
				//log.debug("Create new %s; numDoingJob=%s getJobCount=%s getJobMax=%s", jobs[i], numDoingJob[jobs[i]], room.getJobMax(jobs[i]), room.getJobMax(jobs[i]))
				return spawner.createPerson(jobs[i])
			}
		}
	}
	
	if (numWorkers > 5 && room.energyCapacityAvailable >= 650){
		// Claimers
		if (numDoingJob["reserve"] < room.getJobMax("reserve")){
			let target = taskDirector.tasks.reserve.getTarget()
			//log.debug("reserve target = %s", target)
			if (taskDirector.tasks.reserve.isValidTarget(target)){
				let result = spawner.createPerson("reserve")
				log.trace("Claim %s in %s with result %s (%s/%s)",
					target,
					target.room.name,
					result,
					numDoingJob["reserve"],
					room.getJobMax("reserve")
				)
				return result
			}
		}
	}
	
	// low priority
	if (room.energyCapacityAvailable >= 550 && !room.memory.isGrowing){
		let jobs = ["haul", "upgrade", "mine"]
		for (i=0; i<jobs.length; i++){
			if (numDoingJob[jobs[i]] < room.getJobMax(jobs[i])){
				return spawner.createPerson(jobs[i])
			}
		}
	}
	
	// Assign temp jobs
	if (numWorkers < room.memory.maxWorkers) {
		return spawner.createPerson(room.memory.isGrowing && "grow" || "normal")
	}else{
		let [worstWorkerName, worstWorkerCost] = room.getWorstWorkerCost()
		let worstWorker = Game.creeps[worstWorkerName]
		if (worstWorker) {
			let [possibleWorkerParts, possibleWorkerCost] = room.getBodyParts(worstWorker.getJob())
			if (worstWorkerCost < possibleWorkerCost && room.energyAvailable == possibleWorkerCost){
				console.log("DEBUG doSpawns: "+worstWorkerName+" costs "+worstWorkerCost+" (upgrade available for "+possibleWorkerCost+")")
				Game.creeps[worstWorkerName].setJob("recycle")
			}
		}
	}
	
	
	return OK
}

Room.prototype.getWorstWorkerCost = function(){
	let worstWorker = null
	let cheapestCost = 999999
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && _.includes(["normal","grow"], person.getJob())) {
			let cost = person.getBodyCost()
			if (cost < cheapestCost) {
				cheapestCost = cost
				worstWorker = person
			}
		}
	}
	
	return [worstWorker.name, cheapestCost]
}

Room.prototype.getBodyParts = function(job){
	let room = this
	let numWorkers = room.getNumWorkers()
	let scale = 1
	let maxWorkerCost = Math.min(3500, room.energyCapacityAvailable) * (scale * (numWorkers+1) / room.memory.maxWorkers)
	maxWorkerCost = Math.max(200, Math.min(maxWorkerCost, room.energyCapacityAvailable))
	let personParts = []
	let personCost = 0
	let count = 0
	switch (job) {
		case "scout":
			personParts.push(MOVE)
			personCost += 50
			break
			
		case "reserve":
			personParts = [CLAIM,MOVE]
			personCost += 650
			break
			
		case "grow":
		case "normal":
			if (maxWorkerCost == 300){				
				personParts = [CARRY,WORK,MOVE,MOVE] // 0 extensions
				personCost = 300
			}else if (maxWorkerCost == 350){
				personParts = [CARRY,WORK,WORK,MOVE,MOVE] // 1 extensions
				personCost = 350
			}else if (maxWorkerCost == 550){
				personParts = [CARRY,CARRY,WORK,WORK,WORK,MOVE,MOVE,MOVE] // 5 extensions (max for level 2 controller)
				personCost = 550
			}else{
				count = Math.floor(Math.min(50/3, maxWorkerCost / 200))
				for (i=0; i<count; i++){
					personParts.push(WORK)
					personParts.push(CARRY)
					personParts.push(MOVE)
					personCost += 200
				}
			}
			break
			
		case "upgrade":
			count = Math.floor(Math.min(50/4, maxWorkerCost / 300))
			for (i=0; i<count; i++){
				personParts.push(WORK)
				personParts.push(WORK)
				personParts.push(CARRY)
				personParts.push(MOVE)
				personCost += 300
			}
			break
			
		case "mine":
			count = Math.floor(Math.min((50-1)/5, (maxWorkerCost-50) / 450))
			for (i=0; i<count; i++){
				personParts.push(WORK)
				personParts.push(WORK)
				personParts.push(WORK)
				personParts.push(WORK)
				personParts.push(MOVE)
				personCost += 450
			}
			personParts.push(CARRY)
			personCost += 50
			break
			
		case "haul":
		case "feed":
			count = Math.floor(Math.min((50-2)/3, (maxWorkerCost-150) / 150))
			for (i=0; i<count; i++){
				personParts.push(CARRY)
				personParts.push(CARRY)
				personParts.push(MOVE)
				personCost += 150
			}
			personParts.push(WORK)
			personParts.push(MOVE)
			personCost += 150
			break
			
		case "attackMelee":
			count = Math.floor(Math.min((50-3)/4, (maxWorkerCost-200) / 190))
			
			for (i=0; i<count; i++){
				personParts.push(TOUGH)
				personCost += 10
			}
			for (i=0; i<count; i++){
				personParts.push(ATTACK)
				personParts.push(MOVE)
				personParts.push(MOVE)
				personCost += 180
			}
			personParts.push(WORK)
			personParts.push(CARRY)
			personParts.push(MOVE)
			personCost += 200
			break
			
		case "attackRanged":
			count = Math.floor(Math.min((50-3)/2, (maxWorkerCost-200) / 200))
			
			for (i=0; i<count; i++){
				personParts.push(MOVE)
				personCost += 50
			}
			for (i=0; i<count; i++){
				personParts.push(RANGED_ATTACK)
				personCost += 150
			}
			personParts.push(WORK)
			personParts.push(CARRY)
			personParts.push(MOVE)
			personCost += 200
			//console.log("DEBUG getBodyParts: energy="+room.energyCapacityAvailable+" numWorkers="+numWorkers+" targetPeople="+room.memory.maxWorkers+" maxWorkerCost="+maxWorkerCost+" personCost="+personCost)
			//console.log("DEBUG                   personParts="+personParts)
			break
			
		case "heal":
			count = Math.floor(Math.min((50-3)/2, (maxWorkerCost-200) / 300))
			
			for (i=0; i<count; i++){
				personParts.push(MOVE)
				personCost += 50
			}
			for (i=0; i<count; i++){
				personParts.push(HEAL)
				personCost += 250
			}
			personParts.push(WORK)
			personParts.push(CARRY)
			personParts.push(MOVE)
			personCost += 200
			//console.log("DEBUG getBodyParts: energy="+room.energyCapacityAvailable+" numWorkers="+numWorkers+" targetPeople="+room.memory.maxWorkers+" maxWorkerCost="+maxWorkerCost+" personCost="+personCost)
			//console.log("DEBUG                   personParts="+personParts)
			break
			
		default:
			break
	}
	return [personParts, personCost]
}

Creep.prototype.getBodyCost = function(){
	if (this.memory.bodyCost) return this.memory.bodyCost
	let cost = 0
	for (i=0; i<this.body.length; i++){
		cost += BODYPART_COST[this.body[i].type]
	}
	this.memory.bodyCost = cost
	return cost
}

Room.prototype.doTasks = function(){	
    for (i=0; i<this.memory.people.length; i++ ) {
        let person = Game.creeps[this.memory.people[i]]
		if (!person) continue
		
		if (!person.memory.task){
			person.setJob()
		}
		
		if (person.ticksToLive < Memory.retirementAge && _.includes(["normal","grow","feed","haul","mine"], person.getJob())){
			person.setJob("recycle", true)
			continue
		}
		
		if (!person.canContinueTask()) {
			/*
			TODO: 				
			Figure out why people going off the map to complete a task
			causes a room to forget people from taskCount.
			
			IDEA! Remember the room which began the task:			
			task = {type: "abc", roomName: "wxyz", target: object.id}
			*/
			let task = person.setTask()
		}
		let result = person.doTask()
    }
}

Room.prototype.doLinks = function(){
	let storage = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_STORAGE}})[0]
	let links = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_LINK}})
	if (!storage || links.length == 0) return false
	
	let bestDistance = 999
	let linkDestination = null
	for (i=0; i<links.length; i++){
		let link = links[i]
		let distance = link.pos.getRangeTo(storage)
		//console.log("DEBUG: distance from "+link+" to "+storage+" is "+distance+".")
		if (distance < bestDistance){
			bestDistance = distance
			linkDestination = link
			this.memory.linkDestinationID = link.id
		}
	}
	//console.log("DEBUG: link destination: "+linkDestination+".")
	for (i=0; i<links.length; i++ ){
		let link = links[i]
		if (link != linkDestination && link.energy > 0){
			let energy = Math.min(link.energy, linkDestination.energyCapacity - linkDestination.energy)
			//console.log("DEBUG: transfer "+energy+" energy from "+link+" to "+linkDestination+".")
			link.transferEnergy(linkDestination, energy)
		}
	}
}

Room.prototype.towerAttack = function() {
	let hostiles = this.find(FIND_HOSTILE_CREEPS)
    
	let username = hostiles[0].owner.username
	//Game.notify(`User ${username} spotted in room ${this.name}`)
	let towers = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}})
	towers.forEach(tower => tower.attack(hostiles[0]))
}

Room.prototype.getNumWorkers = function(){
	let numWorkers = 0
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && _.includes(["normal","grow"],person.getJob())) {
			numWorkers++
		}
	}
	return numWorkers
}

Room.prototype.getStoredEnergy = function(){
	let room = this
	let energy = 0
	let storageSum = 0
	let storageCapacity = 0
	let storage = room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_STORAGE})
	for (i=0; i<storage.length; i++){
		//log.debug("%s energy=%s storageCapacity=%s", storage[i], storage[i].store[RESOURCE_ENERGY], storage[i].storeCapacity)
		energy += storage[i].store[RESOURCE_ENERGY]
		storageSum += _.sum(storage[i].store)
		storageCapacity += storage[i].storeCapacity
	}
	return [energy, storageSum, storageCapacity]
}

Room.prototype.findRepairTower = function(){
	if (!this.controller.my) return false
	
	let roomName = this.name
	let energySource = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_STORAGE}})[0]
	if (!energySource) energySource = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_SPAWN}})[0]
	let towers = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}})
	
	let closestTower = towers[0]
	let closestDistance = 9999
	
	if (towers.length == 0) {
		return false
	} else if (towers.length == 1) {
		this.memory.repairTowerID = closestTower.id
		return true
	}
	
	for (i=0; i<towers.length; i++){
		let distance = energySource.pos.getRangeTo(towers[i].pos)
		//console.log("DEBUG: "+towers[i]+" is "+distance+" from "+energySource)
		if (distance < closestDistance) {
			closestTower = towers[i]
			closestDistance = distance
		}
	}
	this.memory.repairTowerID = closestTower.id
	//console.log("DEBUG: Closest tower: "+closestTower)
}

Room.prototype.repairWithTowers = function() {
	if (this.memory.isGrowing == true) return
	
	let tower = Game.structures[this.memory.repairTowerID]
	if (!tower) {
		this.findRepairTower()
		tower = Game.structures[this.memory.repairTowerID]
		if (!tower) return false
	}
		
	if (tower.energy < 0.25 * tower.energyCapacity) return
	
	let repairTargets
	
	// New ramparts
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits <= 300
		&& t.structureType == STRUCTURE_RAMPART
	})
	if (repairTargets[0]) return tower.repair(repairTargets[0])
	
	// Critically damaged structures
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
					   t.hits < 0.5 * t.hitsMax
					&& t.structureType != STRUCTURE_WALL
					&& t.structureType != STRUCTURE_RAMPART
				})
	if (repairTargets[0]) return tower.repair(repairTargets[0])
	
	// Damaged structures
	if (tower.energy < 0.5 * tower.energyCapacity) return // save for defense
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
					   t.hits < t.hitsMax
					&& t.structureType != STRUCTURE_WALL
					&& t.structureType != STRUCTURE_RAMPART
				})
	if (repairTargets[0]) return tower.repair(repairTargets[0])
	
	// Critically damaged walls and ramparts
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) => t.hits < 0.1 * this.getWallMax() && t.structureType == STRUCTURE_RAMPART })
	if (repairTargets.length > 0){
		let towers = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}})
		
		for (i=0; i<towers.length; i++){
			towers[i].repair(repairTargets[0])
		}
		return OK
	}
	
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) => t.hits < 0.1 * this.getWallMax() && t.structureType == STRUCTURE_WALL })
	if (repairTargets.length > 0){
		let towers = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}})
		
		for (i=0; i<towers.length; i++){
			towers[i].repair(repairTargets[0])
		}
		return OK
	}
		
	// Damaged walls and ramparts
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) => t.hits < 0.25 * this.getWallMax() && t.structureType == STRUCTURE_RAMPART })
	if (repairTargets[0]) return tower.repair(repairTargets[0])
		
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) => t.hits < 0.25 * this.getWallMax() && t.structureType == STRUCTURE_WALL })
	if (repairTargets[0]) return tower.repair(repairTargets[0])
	
	// Finish walls and ramparts
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < this.getWallMax()
		&& (t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART)
	})
	if (repairTargets[0]) return tower.repair(repairTargets[0])
	return OK
}

Room.prototype.countHarvestSpots = function(){
	let sources = this.find(FIND_SOURCES)
	let harvestSpots = 0
	//*
	if (_.includes(["W8N3", "W7N4", "W6N3"], this.name)){//sources.length > 1) { // HARDCODE reserved rooms
		//log.debug("Reserve %s", this)
		this.memory.reserve = true
	}else if (this.memory.reserve){
		delete this.memory.reserve
	}//*/
	if (this.memory.reserve){
		//delete this.memory.reserve
	}
	for (i=0; i<sources.length; i++){
		let source = sources[i]
		if (Memory.sources[source.id] == undefined){
			Memory.sources[source.id] = {}
			let sourceSpots = 0
			for (x=source.pos.x-1; x<=source.pos.x+1; x++){
				for (y=source.pos.y-1; y<=source.pos.y+1; y++){
					if (Game.map.getTerrainAt(x, y, this.name) != "wall") {
						sourceSpots += 1
					}
				}
			}
			Memory.sources[source.id].numHarvesters = 0
			Memory.sources[source.id].maxHarvesters = sourceSpots
			Memory.sources[source.id].room = this
			console.log("INFO: Discovered new source in "+this+" with "+sourceSpots+" harvest directions.")
		}
		harvestSpots += Memory.sources[source.id].maxHarvesters
	}
	//console.log("DEBUG: "+this+" has "+harvestSpots+" harvest spots.")
	return harvestSpots
}

Room.prototype.checkIsGrowing = function(){	
	let numWorkers = this.getNumWorkers()
	if (numWorkers < 0.5 * this.memory.maxWorkers){
		if (!this.memory.isGrowing) {
			this.memory.isGrowing = true
			console.log("INFO:  Grow room "+this.name+" ("+numWorkers+"/"+this.memory.maxWorkers+")")
			this.setJobLimits()
			//this.setTaskLimits()
			this.resetPeople()
		}
	} else if (this.memory.isGrowing && numWorkers > 2 + 0.5 * this.memory.maxWorkers) {
		this.memory.isGrowing = false
		console.log("INFO:  Stop growing room "+this.name+" ("+numWorkers+"/"+this.memory.maxWorkers+")")
		this.setJobLimits()
		//this.setTaskLimits()
		this.resetPeople()
	}
}

Room.prototype.getWallMax = function() {
	if (!this.memory.wallMax) this.setWallMax()
	return this.memory.wallMax
}
	
Room.prototype.setWallMax = function(max) {
	if (!room.controller.my) this.memory.wallMax = 0
	
	let maxByLevel = 500 * Math.pow(3, this.controller.level - 1)
	if (!max) max = maxByLevel
	this.memory.wallMax = Math.max(maxByLevel, max)
	//console.log("DEBUG:  "+this.name+" wallMax="+this.memory.wallMax+", maxByLevel="+maxByLevel)
}

// end