const fetch = require("node-fetch")
const parser = require("fast-xml-parser")
const notifier = require("node-notifier")
const hash = require("object-hash")
const fs = require("fs")

const seenItemStorePath = "./seenItemStore.json"
const CHECK_INTERVAL = 1000 * 60 * 10

const url = query => `https://chicago.craigslist.org/search/sss?format=rss&query="${query}"&sort=rel`

const itemsSeen = []
;{
	const seenItemsStoreString = fs.readFileSync(seenItemStorePath, "utf-8")
	const seenItemsStoreObj = JSON.parse(seenItemsStoreString || "[]")
	seenItemsStoreObj.forEach(i => itemsSeen.push(i))
}
const markItemAsSeen = item => {
	itemsSeen.push(hash(item))
	fs.writeFileSync(seenItemStorePath, JSON.stringify(itemsSeen, null, 2))
}
const isSeen = item => {
	const itemHash = hash(item)
	return itemsSeen.includes(itemHash)
}

const checkForProduct = async ({query, price}) => {
	const queryPromise = await fetch(url(query))
	const xmlString = await queryPromise.text()
	const resultObject = parser.parse(xmlString)

	const unparsedItems = resultObject["rdf:RDF"].item

	const items = unparsedItems.map(item => {
		const [ title, price ] = item.title.split("&#x0024;")
		return {
			title: title.trim(),
			price: +price,
			link: item.link,
			description: item.description
		}
	})

	const relevantItems = items.filter(item => item.title.toLowerCase().includes(query))
	const cheapRelevantItems = relevantItems.filter(item => item.price < price)
	const unseenCheapRelevantItems = cheapRelevantItems.filter(item => !isSeen(item))
	if (unseenCheapRelevantItems.length === 0) {
		console.log("nothing new")
	}

	unseenCheapRelevantItems.forEach(item => {
		markItemAsSeen(item)
		console.log(item)
		notifier.notify({
			title: `New: ${item.title}`,
			message: item.description + "\n" + item.link,
			open: item.link
		})
	})
}

let lastChecked = 0
const itemsToLookFor = require("./itemsToLookFor.json")
const runCheck = ()=>{
	const now = new Date().getTime()
	if (now > lastChecked + CHECK_INTERVAL) {
		console.log(Date())
		itemsToLookFor.forEach(item => checkForProduct(item))
		lastChecked = now
	}
}
setInterval(runCheck, 1000 * 60 * 1)
runCheck()
