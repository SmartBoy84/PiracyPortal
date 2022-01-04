# PiracyPortal
 Frontend & semi-backend wrapper for Jackett scraper
 
## Features ##
* Scalable GUI
* Table sorting: by seeds, leechers, name or file size. One can also group by file type
* Serve torrent files/magnet links by Jackett service without exposing it to the internet
* Usable category filter search

 ### Running ###
* Initialize node application by cloning into a directory and calling `npm i`
* Ensure that you've setup Jackett on the `localhost` at port `9117` and it's base URL is unchanged (these values can be changed by editing main.js accordingly)
* Other than that, the application should be able to automatically detect and serve your selected trackers

### Notes: ###
* Through my ISP, most of the torrent sites were inaccessible; I bypassed this restriction by settings my router's DNS to cloudflares DNS (`1.1.1.1`)
* If you're planning on proxying the app through Apache or some other hosting service then ensure that websockets are being proxied as well. You can verify this by checking the console for logs indicating failiure to connect to the backend (Socket.io pings every ~1 second so these should be regular)
* I've disabled pornography related categories, if you lack the experience to enable this yourself but want those categories enabled then don't use this 🤷

#### Developer notes ####
For "detailed" ramblings about the various hacks and patches used to get this to work, checkout notes.md

* I use websockets to serve the results rather than tradition fetch() requests as Jackett usually takes longer than the hardcoded timeout limits set by the browser
