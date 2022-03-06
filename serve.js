const request = require('request')
const path = require("path")

const { promises: fs } = require("fs")
const fss = require("fs")
const axios = require("axios")

var pretty = require('express-prettify');

const express = require('express')
const app = express()

app.use(express.json());
app.use(pretty({ query: 'pretty' }));

app.use("/assets", express.static(path.join(__dirname, 'assets')))

let torrentCache = "torrentcache"
app.use(`/${torrentCache}`, express.static(path.join(__dirname, torrentCache)))

const server = require('http').createServer(app);

const { Server } = require("socket.io");
const e = require('express')
const io = new Server(server);

// ---------------------------------------------------------

let timeout = 60 * 60 * 1000 // [minutes [seconds [milliseconds [60 minutes]

let base = "http://127.0.0.1:9117"
let api = "api/v2.0"


// TODO: only renew cookie when expiration is detected
let getCook = async () => await ((await (axios.get(`${base}/UI/login`, { withCredentials: true, timeout }))).headers["set-cookie"][0].split("Jackett=")[1]) // Get a new cookie

let fetch = async url => {

  // Apparently timeout in axios is reponse timeout not connection timeout
  // this means that it doesn't apply when GETting local IPs so one has to do this:
  let source = axios.CancelToken.source()

  let timer = setTimeout(() => {
    source.cancel();
  }, timeout);

  let res = await axios.request({
    url: `${base}/${api}/${url}`,
    method: "get",
    headers: {
      Cookie: `jackett=${await getCook()}` // Yep, we have to get a new cookie because apparently they expire?!
    },

    // timeout, // Surely if it doesn't respond after a minute, something's wrong?
    cancelToken: source.token,
    timeout
  }).catch(err => err)

  clearTimeout(timer)

  return res
}

let bad = ["porn", "xxx", "adult", "hentai", "slut", "bitch", "fucked"]
let badCats = [6, 8] // porn and other

/*     
{ "8000": "Other" },
    { "8010": "Other/Misc" },
    { "8020": "Other/Hashed" } 
    */

let categories
let loginCookie
let indexers
let guide


let configure = async () => {
  // Don't use the following please
  // categories = (await axios.get("https://raw.githubusercontent.com/Jackett/Jackett/master/src/Jackett.Common/Models/TorznabCatType.cs")).data.split("\n").filter(a => a.includes("new TorznabCategory")).map(a => a.split("new TorznabCategory(")[1].split(",")).map(a => ({ [a[0]]: a[1].replaceAll(`");`, "").replaceAll(` "`, "") }))


  indexers = (await fetch("indexers")).data
    .filter(a => a.configured) // Ensure indexer is selected in Jackett configuration
    .map(a => ({ ...a, caps: a.caps.filter(b => parseInt(b.ID) >= 9000) })) // Ensure that the indexer's "cap" element only contains custom categories

  // console.log(indexers.map(a => [a.id, ...a.caps]))

  categories = {

    // Populate with standard categories
    ...await JSON.parse(
      await fs.readFile(path.join(__dirname, "/categories.json"), "utf8").catch(err => console.log(`Error reading categories: ${err}`))
    ).reduce((a, c) => {
      let id = parseInt(Object.keys(c)[0])
      let cat = [...c[id].split("/")]
      if (cat.length == 1) {
        cat.push(cat[0]) // Hacky solution to get main category names as well
      }

      if (!badCats.includes(Math.floor(id / 1000)) /* Porn category */) { // ensure it's not one of the main categories
        a[cat[0]] = [...a[cat[0]] != undefined ? a[cat[0]] : [], [cat[1], id]]
      }

      return a
    }, {}),

    // Populate with custom categories
    ...indexers.reduce((a, c) => {

      let custom = c.caps.filter(a =>
        parseInt(a["ID"]) > 9000 && // Ensure that it is a non-standard category (Though this has already been assured in the indexer fetch() but icb removing this)

        // Filter function
        ((b) =>
          [...bad /* Pornography */,
            "other(tbd)" /* TorrentFunk placeholder categories */
          ].find(c => b.includes(c)) == undefined &&

          (isNaN(b) || parseInt(b).toString().length != b.length) && // God damn movietorrent listed every single year up to 2021 as a category (this test ensures the category is more than just a number)
          (a["Name"] = a["Name"].replaceAll("♫", "Music")) // anidex - replace music symbol with music term to aid search
        )(a["Name"].toLowerCase())
      )

      if (custom.length > 0) {
        a[c.name] = custom.map(a => [a["Name"], a["ID"]])
      }

      return a
    }, {})
  }

  guide = [
    `[DEPECRATED - USE WEBSOCKETS NOW] Make a POST request to 'piracy.gabba.ga/api' containing on object with all the following arguments`,
    {
      "Query": ["Any string, seperated by spaces", "Key words work but only for some trackers", "Try to be as accurate as possible to maximise results"],
      "Categories": ["Array of category *NUMBERS*.", "Find names of categories and their numbers below.", "Note the first array in each set is a 'master' category meaning selecting it chooses all the subcategories at index 1."],
      "Indexers": ["Array of tracker *NAMES*", "Found below categories array"]
    },
    {
      Categories: Object.values(categories).flat(),
      Tracker: indexers.map(a => a.id)
    }
  ]
}
configure()

server.listen(3004, () => console.log('listening on *:3000'));

// http://192.168.0.241:9117/api/v2.0/indexers/all/results?apikey=j578nolvdu67rca6v8a3udxornucjiz9&Query=boi&Category%5B%5D=3040&Category%5B%5D=4050&Category%5B%5D=6000&Tracker%5B%5D=anidex&Tracker%5B%5D=badasstorrents&Tracker%5B%5D=bt4g&_=1641201881543

let apiKey = "j578nolvdu67rca6v8a3udxornucjiz9"

app.get("/", async (req, res) => {
  await configure() // in case something changed on the backend sidecatg 
  res.sendFile(path.join(__dirname + "/index.html"))
})

app.get("/api/info", (req, res) => res.json({ categories, indexers }))
app.get("/api/guide", (req, res) => res.json(guide))

app.get("/path/:id/:tracker/:name", async (req, res) => {

  let uri = `http://127.0.0.1:9117/dl/${req.params.tracker}/?jackett_apikey=${apiKey}&path=${req.params.id}`
  let url

  try {

    await request({
      method: "GET", uri,
      followRedirect: false, // We don't want it to follow any redirects as one way could be a magnet link
      encoding: null, // This prevents the module from decoding the data via unicode
      gzip: true // Jackett (as many sites do) uses gzip compression
    }, async (err, reply, body) => {

      if (err) { throw err }
      else if (reply.statusCode == 302) { // if redirected to a magnet link

        url = reply.headers.location
        console.log("Jackett returned a magnet link!", url)

      }
      else if (body) { // if data was returned then assume torrent file

        console.log("Jackett returned a torrent file!")
        url = `/${torrentCache}/${req.params.name}.torrent`

        await fs.writeFile(path.join(__dirname, url), body,
          {
            flag: 'wx', // only creates a new file if it doesn't already exist
            recursive: true // creates any subdirectories if needed
          }
        ).catch(err => {

          if (err.code == "EEXIST") {
            console.log("Torrent found in cache!")
          }
          else { throw err }

        })

      }
      else {
        console.log(reply.statusCode)
        throw 'Ooodd, nothing was returned?'
      }

      res.redirect(url)
    })
  }
  catch (err) { res.send(err) }

})

io.on('connection', (socket) => {
  console.log('a user connected');

  // Query route
  socket.on('query', async (msg) => {
    console.log("ID IS", socket.id)

    io.to(socket.id).emit("result", await search(msg))
  });
});

let cache = {}

let combine = (s, id) => s.length > 0 ? s.reduce((a, c) => `${a}&${id}%5B%5D=${c}`, "") : ""
let apiGen = (q) => `indexers/all/results?apikey=${apiKey}&Query=${q.query.toLowerCase()}${combine(q.categories, "Category")}${combine(q.indexers, "Tracker")}`

// Search query handler
let search = async (query) => {
  console.log("Request for query", query)

  let refresh // Hacky flag

  if (query.query.slice(-2).toLowerCase() == "%z") {
    console.log("Refresh search query!")

    refresh = true
    query.query = query.query.substring(0, query.query.length - 2)

  }

  let url = apiGen(query)

  //http://192.168.0.241:9117/api/v2.0/indexers/all/results?apikey=j578nolvdu67rca6v8a3udxornucjiz9&Query=no%20way%20home&Category%5B%5D=2000&Category%5B%5D=2010&Category%5B%5D=2030&Category%5B%5D=2040&Category%5B%5D=2045&Category%5B%5D=2050&Category%5B%5D=2060&Category%5B%5D=2070&Tracker%5B%5D=1337x&Tracker%5B%5D=badasstorrents&Tracker%5B%5D=bitsearch&Tracker%5B%5D=kickasstorrents-to&Tracker%5B%5D=rarbg&Tracker%5B%5D=torrentparadise&Tracker%5B%5D=yts&_=1641222384604

  let reply

  if (cache[url] && !refresh) {
    console.log("Found lying around in cache!")

    reply = cache[url]
  }
  else {

    try {
      reply = await fetch(url)
      if (reply instanceof Error) throw "Error fetching data"

      reply = await (reply.data)
      if (reply instanceof Error) throw "Error parsing results"

      if (reply == undefined || !Object.keys(reply).includes("Results")) throw "Malformed result object"

      // I have to fucking filter out porn again because for some fucking reason some torrent sites choose to return fucking pornography even if that category isn't specified
      reply.Results = reply.Results.filter(a => !(a.Category.some(b => badCats.includes(Math.round(parseInt(b) / 1000))) || bad.some(b => a.Title.toLowerCase().includes(b)))) // Remove pornography

      for (let i = 0; i < reply.Results.length; i++) {
        if (reply.Results[i].MagnetUri == null && reply.Results[i].Link != null) {

          reply.Results[i].Link = `./path/${reply.Results[i].Link.split("&path=")[1]}/${reply.Results[i].TrackerId}/${reply.Results[i].Title}`
        }
      }

      // reply.Results = reply.Results.filter(a => !a.Category.some(b => query.categories.includes(b.toString())))
      cache[url] = reply // Store in cache in case of future requests
      console.log("Successfully fetched results from Jackett backend!")
    }
    catch (error) {
      return ({ error, reply }) // I have to be super careful to handle the various exceptions that can occur in the program otherwise I risk crashing if given malformed data from Jackett's backend
    }
  }

  return reply
}

/* Troubleshooting guide: 
Make sure the API key is correct
Make sure that the Jackett backend is accessible
*/
