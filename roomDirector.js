let _ = require("lodash")
var jobDirector = require("jobDirector")
var taskDirector = require("taskDirector")
//let log = require("logger")

//console.log("TRACE doSpawns: taskDirector.tasks.reserve.getTarget() = "+taskDirector.tasks.reserve.getTarget())

Memory.retirementAge = 30
let harvestRate = 2
let carryCapacity = 50
let sourceRespawnTime = 300

module.exports = {

};

Room.prototype.createPerson = function(jobName, info){
	let spawner = this.find(FIND_MY_SPAWNS)[0]
	let [bodyParts, bodyCost] = this.getBodyParts(jobName)
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
				
	this.memory.people.push(personName)
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

Room.prototype.doSpawns = function(){
	let spawner = this.find(FIND_MY_SPAWNS)[0]
	
	if (Game.time % 10 == 0){
		room = this
		if (room.controller.my){
			let [workerParts, workerCost] = this.getBodyParts("normal")
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
				room.memory.maxWorkers = 3 * this.find(FIND_SOURCES).length
			}else{
				let maxWorkers = 3 * this.find(FIND_SOURCES).length
				
				for (let sourceID in Memory.sources) {
					let source = Game.getObjectById(sourceID)
					if (source) {
						maxWorkers += source.energyCapacity / Math.max(1000, this.energyCapacityAvailable)
					}
				}
				room.memory.maxWorkers = Math.round(maxWorkers)
			}
		}else{
			room.memory.maxWorkers = 0
		}
	}
	
	// count workers
	this.memory.people = this.memory.people || []
	let numWorkers = this.countNumWorkers()
	
	if (!spawner) return ERR_NOT_OWNER
	if (this.memory.isGrowing == undefined) this.memory.isGrowing = true
	
	//console.log("TRACE: "+numWorkers+"/"+this.memory.maxWorkers+" people in "+this.name)
	
	//this.memory.isGrowing = true
	this.checkIsGrowing()
	
	let personName = ""
	
	let recyclePeople = spawner.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (t) => t.getTask() == "recycle"})
	for (i=0; i<recyclePeople.length; i++){
		spawner.recycleCreep(recyclePeople[i])
	}
	
	let numDoingJob = {}
	for (let jobName in Memory.defaultJobPriorities){
		numDoingJob[jobName] = 0
	}
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && person.ticksToLive > Memory.retirementAge + 2*person.body.length) {
			numDoingJob[person.getJob()] += 1
		}
	}
	
	if (spawner.spawning) return ERR_BUSY
	
	// Assign scouts
	for (let roomName in Memory.scouts) {
		//console.log("TRACE: Memory.scouts["+roomName+"]="+Memory.scouts[roomName])
		
		if (Memory.scouts[roomName] == "none"){
			if (this.createPerson("scout", roomName) == OK) return OK
		}
	}	
	
	if (this.energyCapacityAvailable >= 550 && !this.memory.isGrowing){
		// Assign haulers
		let roomHasStorage = this.find(FIND_STRUCTURES, {filter: (t) => 
				   t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_STORAGE
				}).length > 0
		//console.log(sprintf("DEBUG: roomHasStorage=%s numDoingJob.haul=%s this.energyCapacityAvailable=%s", roomHasStorage, numDoingJob["haul"], this.energyCapacityAvailable))
		if (roomHasStorage && numDoingJob["haul"] < Math.floor(this.energyCapacityAvailable / 900)){
			return this.createPerson("haul")
		}
		
		// Assign guards
		let maxGuards = this.energyCapacityAvailable < 1800 && 2 || 1
		if (numDoingJob["attackMelee"] < maxGuards){
			return this.createPerson("attackMelee")
		}
		if (numDoingJob["attackRanged"] < maxGuards){
			return this.createPerson("attackRanged")
		}
		if (numDoingJob["heal"] < maxGuards){
			return this.createPerson("heal")
		}
	}
	
	if (this.energyCapacityAvailable >= 650){
		// Assign claimers
		if (numDoingJob["reserve"] < this.getJobMax("reserve")){
			let target = taskDirector.tasks.reserve.getTarget()
			if (taskDirector.tasks.reserve.isValidTarget(target)){
				let result = this.createPerson("reserve")
				if (result == OK) {
					//console.log("DEBUG doSpawns: claim "+target+" in "+target.room.name+" ("+numDoingJob["reserve"]+"/"+this.getJobMax("reserve")+")")
				}
				return result
			}
		}
	}
	
	// Assign temp jobs
	if (numWorkers < this.memory.maxWorkers) {
		return this.createPerson(this.memory.isGrowing && "grow" || "normal")
	}else{
		let [worstWorkerName, worstWorkerCost] = this.getWorstWorkerCost()
		let worstWorker = Game.creeps[worstWorkerName]
		if (worstWorker) {
			let [possibleWorkerParts, possibleWorkerCost] = this.getBodyParts(worstWorker.getJob())
			if (worstWorkerCost < possibleWorkerCost && this.energyAvailable == possibleWorkerCost){
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
	let numWorkers = this.countNumWorkers()
	let scale = 1
	let maxPersonCost = Math.min(this.energyCapacityAvailable, 3000) * (scale * (numWorkers+1) / this.memory.maxWorkers)
	maxPersonCost = Math.max(200, Math.min(maxPersonCost, this.energyCapacityAvailable))
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
			count = Math.floor(Math.min(50/3, maxPersonCost / 200))
			if (maxPersonCost == 300){				
				personParts = [CARRY,WORK,MOVE,MOVE] // 0 extensions
				personCost = 300
			}else if (maxPersonCost == 350){
				personParts = [CARRY,WORK,WORK,MOVE,MOVE] // 1 extensions
				personCost = 350
			}else if (maxPersonCost == 550){
				personParts = [CARRY,CARRY,WORK,WORK,WORK,MOVE,MOVE,MOVE] // 5 extensions (max for level 2 controller)
			}else{
				for (i=0; i<count; i++){
					personParts.push(WORK)
					personParts.push(CARRY)
					personParts.push(MOVE)
					personCost += 200
				}
			}
			break
			
		case "haul":
			count = Math.floor(Math.min((50-2)/2, (maxPersonCost-150) / 150))
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
			count = Math.floor(Math.min((50-3)/4, (maxPersonCost-200) / 190))
			
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
			count = Math.floor(Math.min((50-3)/2, (maxPersonCost-200) / 200))
			
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
			//console.log("DEBUG getBodyParts: energy="+this.energyCapacityAvailable+" numWorkers="+numWorkers+" targetPeople="+this.memory.maxWorkers+" maxPersonCost="+maxPersonCost+" personCost="+personCost)
			//console.log("DEBUG                   personParts="+personParts)
			break
			
		case "heal":
			count = Math.floor(Math.min((50-3)/2, (maxPersonCost-200) / 300))
			
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
			//console.log("DEBUG getBodyParts: energy="+this.energyCapacityAvailable+" numWorkers="+numWorkers+" targetPeople="+this.memory.maxWorkers+" maxPersonCost="+maxPersonCost+" personCost="+personCost)
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
		
		if (person.ticksToLive < Memory.retirementAge && _.includes(["normal","grow","haul"], person.getJob())){
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
		if (result == OK) {
			// pick new task and move
		}
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

Room.prototype.countNumWorkers = function(){
	let numWorkers = 0
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && _.includes(["normal","grow"],person.getJob())) {
			numWorkers++
		}
	}
	return numWorkers
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
	
	// Critically damaged structures
	let repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
					   t.hits < 0.5 * t.hitsMax
					&& t.structureType != STRUCTURE_WALL
					&& t.structureType != STRUCTURE_RAMPART
				})
	if (repairTargets[0]) {
		tower.repair(repairTargets[0])
		return
	}
	
	// Damaged structures
	if (tower.energy < 0.5 * tower.energyCapacity) return // save for defense
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
					   t.hits < t.hitsMax
					&& t.structureType != STRUCTURE_WALL
					&& t.structureType != STRUCTURE_RAMPART
				})
	if (repairTargets[0]) {
		tower.repair(repairTargets[0])
		return
	}
	
	// Walls and ramparts
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < this.getWallMax()
		&& (t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART)
	})
	if (repairTargets[0]) {
		tower.repair(repairTargets[0])
		return
	}
}

Room.prototype.countHarvestSpots = function(){
	let sources = this.find(FIND_SOURCES)
	let harvestSpots = 0
	if (_.includes(["W7N4"], this.name)){//sources.length > 1) { // HARDCODE reserved rooms
		this.memory.reserve = true
	}else if (this.memory.reserve){
		delete this.memory.reserve
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
	let numWorkers = this.countNumWorkers()
	if (numWorkers < 0.5 * this.memory.maxWorkers){
		if (!this.memory.isGrowing) {
			this.memory.isGrowing = true
			console.log("INFO:  Grow room "+this.name+" ("+numWorkers+"/"+this.memory.maxWorkers+")")
			this.setJobLimits()
			this.setTaskLimits()
			this.resetPeople()
		}
	} else if (this.memory.isGrowing && numWorkers > 2 + 0.5 * this.memory.maxWorkers) {
		this.memory.isGrowing = false
		console.log("INFO:  Stop growing room "+this.name+" ("+numWorkers+"/"+this.memory.maxWorkers+")")
		this.setJobLimits()
		this.setTaskLimits()
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