module.exports = {
	energyCheckDelay : 10,
	assetCheckDelay : 60,
	historyDelay : 10,	
}

let log = require("logger")
log.setLevel(levelType.LEVEL_DEBUG)


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

Memory.hour = Memory.hour || new Date().getHours()
Memory.day = Memory.day || new Date().getDay()


statistics: {
	
	module.exports.logAll = function (){
		let hour = new Date().getHours()
		if (hour != Memory.hour){
			Memory.hour = hour
			this.printStatistics()
		}
		
		let day = new Date().getDay()
		if (day != Memory.day){
			Memory.day = day
			log.info("Sending log to email.")
			Game.notify("These events happened in our empire over the past 24 hours.\n\n" + Memory.log)
			//Memory.log = ""
		}
	}

	module.exports.printStatistics = function(){
		log.info("Total Assets = %s", this.getTotalAssets())
		this.printAssetStatistics(60)
		let energyStatistics = this.getStoredEnergyStatistics()
		log.info("Energy over %.2d minutes - average=%s min=%s max=%s",
			energyStatistics.minutes,
			energyStatistics.average,
			energyStatistics.minimum,
			energyStatistics.maximum
		)
	}

	module.exports.getStoredEnergyStatistics = function(){
		if (!Memory.sourceEnergyAvailable) {
			this.rememberSourceData()
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
			minutes: this.energyCheckDelay * Memory.sourceEnergyAvailable.length / 60,
			average: sum / Memory.sourceEnergyAvailable.length,
			minimum: minEnergy,
			maximum: maxEnergy
		}
		return statistics
	}

	module.exports.printAssetStatistics = function(numMinutes){
		if (!Memory.totalAssets) {
			this.rememberAssets()
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
		let rangeToCompare = minutes * 60/this.assetCheckDelay
		
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
		//console.log(sprintf("INFO: assets over %.2d minutes - average=%s min=%s max=%s", this.assetCheckDelay * Memory.sourceEnergyAvailable.length / 60, statistics.average, statistics.minimum, statistics.maximum))
		return statistics
	}


	module.exports.rememberAssets = function(){
		let totalAssets = this.getTotalAssets()
		if (!Memory.totalAssets){
			Memory.totalAssets = Array(61).fill(totalAssets)
			Memory.totalAssetsIndex = -1
		}
		Memory.totalAssetsIndex = (1 + Memory.totalAssetsIndex) % Memory.totalAssets.length
		Memory.totalAssets[Memory.totalAssetsIndex] = totalAssets
	}

	module.exports.getTotalAssets = function(){
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

	module.exports.getWallEnergy = function(roomName){
		let room = Game.rooms[roomName]
		if (!room) return room
		
		let energy = 0
		
		let walls = room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART})
		for (i=0; i<walls.length; i++){
			energy += walls[i].hits / 100
		}
		
		return energy
	}

	module.exports.rememberSourceData = function(){
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

}