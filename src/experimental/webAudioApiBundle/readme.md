# BUNDLE NODEFONY WEBAUDIOAPI



## Add  WEBAUDIOAPI bundle in Framework :
Open Bundle App "appKernel.js" to add new WEBAUDIOAPI Bundle in **registerBundles** array : 
```js
/*
 *	ENTRY POINT FRAMEWORK APP KERNEL
 */

nodefony.register("appKernel",function(){

	var appKernel = function(type, environment, debug, loader){
		
		// kernel constructor
		var kernel = this.$super;
		kernel.constructor(environment, debug, loader, type)

		/*
	 	*	Bundles to register in Application
	 	*/
		this.registerBundles([
			"src/bundles/webAudioApiBundle"
		]);

		...


					
	}.herite(nodefony.kernel);

	return appKernel;
})
```
## <a name="authors"></a>Authors

-     

##  <a name="license"></a>License

