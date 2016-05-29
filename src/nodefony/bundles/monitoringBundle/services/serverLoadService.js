var QS = require('qs');
var https = require('https');
var http = require('http');
var shortId = require("shortid");
var request = require("request");
var os = require("os");


nodefony.registerService("serverLoad", function(){


	var  cpuAverage = function() {
		var totalIdle = 0 ;
		var totalTick = 0 ;

		var cpus = os.cpus();
		

		//Loop through CPU cores
		for ( var i = 0 ; i < cpus.length ; i++) {
			var cpu = cpus[i];
			//Total up the time in the cores tick
    			for(var type in cpu.times) {
				totalTick += cpu.times[type];
   			}
			//Total up the idle time of the core
			totalIdle += cpu.times.idle;
		}
		//Return the average
		return {
			idle : totalIdle / cpus.length ,
			total : totalTick / cpus.length
		}
	}

	var cpuInit = function(){
		var start = cpuAverage.call(this);		
			
		return function(){
			var end = cpuAverage.call(this);

			var dif = {};

			dif.idle  = end.idle  - start.idle ;
			dif.total = end.total - start.total ;

			dif.percent = 100 - ~~(100 * dif.idle / dif.total);
			
			this.cpu.push(dif);
			return dif ;

		}.bind(this)
	}


	var averaging = function(){
		this.timesConcurence = [] ;
		this.statusCode = {} ;
		this.requestBySec= [] ;
		this.cpu = [] ;
		this.total = 0 ;
	}

	averaging.prototype.addTimeAverage = function(tab){
		var status = {} ;	
		var time = 0 ;

		for (var i= 0 ; i< tab.length ; i++){
			time += tab[i].time ;
			if (tab[i].statusCode in this.statusCode ){
				this.statusCode[tab[i].statusCode] += 1 ;	
			}else{
				this.statusCode[tab[i].statusCode] = 1	
			}

			if (tab[i].statusCode in status ){
				status[tab[i].statusCode] += 1 ;	
			}else{
				status[tab[i].statusCode] = 1	
			}
		}
		var res = time / tab.length ;
		this.timesConcurence.push( res ) ;

		var requestBySec =( tab.length / ( time / 1000 )  ) ;
		this.requestBySec.push( requestBySec ) ;

		return {
			average:( res / 1000  ).toFixed(2),
			total:( time / 1000 ).toFixed(2),
			requestBySec: requestBySec.toFixed(2) ,
			statusCode:status,
		}
	}

	averaging.prototype.average = function(){
		var time = 0 ;
		for (var i= 0 ; i< this.timesConcurence.length ; i++){
			time += this.timesConcurence[i];
		}
		return  ( ( time / this.timesConcurence.length ) / 1000 ).toFixed(2) ;
	}

	averaging.prototype.cpuAverage = function(){

		var idle = 0 ;
		var total = 0 ;
		var percent = 0 ;

		for (var i= 0 ; i< this.cpu.length ; i++){
			 idle += this.cpu[i].idle;
			 total += this.cpu[i].total;
			 percent += this.cpu[i].percent;
		}	

		return {
			idle : ( ( idle / this.cpu.length )  ).toFixed(2) ,
			total : ( ( total / this.cpu.length )  ).toFixed(2) ,
			percent : ( ( percent / this.cpu.length )  ).toFixed(2)
		}
	}


	var testLoad = function( context,  manager , options){
		this.manager = manager ;
		this.nbRequest = parseInt( options.nbRequest ,10 ) ;
		this.nbRequestSent = 0;
		this.nbError = 0 ;
		this.nbSuccess = 0 ;
		this.concurrence = parseInt( options.concurence ,10 );
		this.context = context ;
		this.options = options ;
		this.averaging = new averaging() ;
		this.sid = options.sid ;

		this.httpsSettings =  this.manager.get("httpsServer").settings ;
		this.rootDir = this.manager.kernel.rootDir ; 
		this.stopChain = false ;
		this.running = false ;

	}

	testLoad.prototype.requests = function( start ){
		var tab = [] ;
		var cpu = cpuInit.call(this.averaging);
		for ( var i = 0 ; i < this.concurrence ; i++){
			tab.push( this.HttpRequest( ) );		
		}	

		var myResult = null ; 

		this.running = true ;

		//tab.map(function(ele){return ele()})
		Promise.all(tab)
		.catch(function(e){
			this.manager.logger(e,"ERROR");
			this.running = false ;
			//throw e ;
			this.context.send( JSON.stringify({
				running:this.running,
				message:e.message
			}) );

		}.bind(this))
		.then(function(result){
			//console.log(result)
			//this.manager.logger( "PROMISE HTTP THEN" , "DEBUG");	
			myResult = result ;
			var stop = new Date().getTime();
			if ( result ){
				var addTimeAverage  = this.averaging.addTimeAverage( result );
				var time = ( stop - start ); 
				this.averaging.total += time ;
				var sec =   time / 1000 ;
				var nbRequestSec = this.concurrence /  addTimeAverage.average    ;
		        	//this.averaging.addRequestBySec( nbRequestSec );
				this.context.send( JSON.stringify({
					average: addTimeAverage.average,
					statusCode: addTimeAverage.statusCode,
					requestBySecond: nbRequestSec.toFixed(2),
					totalTime: sec  ,//this.averaging.averageResquestBySec(),
					percentEnd: ( (this.nbRequestSent * 100) / this.nbRequest ).toFixed(2) ,
					nbResquest: this.nbRequestSent,
					running: this.running,
					cpu: cpu()
				}) );
				if ( ( this.nbRequestSent < this.nbRequest ) && this.stopChain === false ) {
					this.requests( new Date().getTime() );
				}else{
					this.running = false ;
					this.context.send( JSON.stringify({
						message: "END LOAD TEST",
						average: this.averaging.average(),
						totalTime: this.averaging.total / 1000,
						stop: stop,
						statusCode: this.averaging.statusCode,
						requestBySecond: (  this.nbRequestSent / ( this.averaging.total / 1000 )  ).toFixed(2),
						percentEnd: 100 ,
						nbResquest: this.nbRequestSent,
						running: this.running,
						cpu: this.averaging.cpuAverage(), 
						//prototcol:prototcol
					}) );
					this.context.close();	
				}
			}
		}.bind(this))
		.done(function(ele){
			this.manager.logger( "PROMISE HTTP DONE" , "DEBUG");

		}.bind(this))
	}


	testLoad.prototype.HttpRequest = function(){

		var agentOptions = {
			//key: fs.readFileSync(this.rootDir+this.httpsSettings.certificats.key),
			//cert: fs.readFileSync(this.rootDir+this.httpsSettings.certificats.cert),
			//rejectUnauthorized: false,
			//requestCert: true
		};

		var options = {
			url: this.options.url,
			method:this.options.method || "GET" ,
			forever:true, // keepAlive
			followRedirect:true,
			agentOptions:agentOptions,
			headers: {
				'User-Agent': 'NODEFONY'
			},
			jar:null
		};

		if ( this.context.session  ){
			var j = request.jar();
			var cookie = request.cookie(this.context.session.name+"="+this.context.session.id);
			var url = options.url;
			j.setCookie(cookie, url);
			options.jar = j ;
		}

		var promise = new Promise( function(resolve, reject){ 
			
			var start = new Date().getTime() ;
			request(options, function(error, response, body){
				var stop = new Date().getTime() ;	
				this.nbRequestSent+=1 ;
				//console.log(this.nbRequestSent);
				if (error){
					var code = error.code ;
					//console.log(error)
					this.nbError +=1 ;
					resolve({
						error:error,
						message:error.message,
						statusCode:code,
						time:stop - start
					});
					return;
				}
				var code = response.statusCode ;
				resolve({
					statusCode:code,
					time:stop - start
				});
			}.bind(this));
		}.bind(this));
		return promise ;
	};

	testLoad.prototype.stop = function(sid){
		this.stopChain = true ;
		delete this.manager.connections[sid];
	};
	
	testLoad.prototype.handleMessage = function(message){
		if ( ! message ) return ;
		switch ( message.action ){
			case "stop" :
				this.stop(this.sid);
			break;	
			default:
				return ;
		}
	};

	// service
	var service = function( container, kernel){
	
		this.container = container ;
		this.kernel = kernel ;
		this.name ="serverLoad" ;
		this.connections = {} ;

	};

	service.prototype.logger = function(pci, severity, msgid,  msg){
		if (! msgid) msgid = "\033[34m SERVICE SERVER LOAD \033[0m";
		if ( this.realTime )
			this.realTime.logger(pci, severity,msgid);
		else
			this.kernel.logger(pci, severity,msgid);
	};

	service.prototype.handleConnection = function(message , context){
		switch (message.type){
		
			case "action":
				if (message.sid ){
					this.connections[message.sid].handleMessage(message);
					return ;
				}	
			break;      
			default:
				if (message.query){
					var obj = QS.parse(message.query) ;
					this.loadHTTP( context,  obj );
				}else{
					this.loadHTTP( context,  message );	
				}
		}
		
	}

	service.prototype.loadHTTP = function(context, options){
		
		if ( !  options.sid ){
			var sid = shortId.generate() ;

			var start = new Date().getTime();
			context.send( JSON.stringify({
				message:"START LOAD TEST",
				nbRequest:options.nbRequest,
				running:true,
				concurence:options.concurence,
				percentEnd:0 ,
				start:start,
				sid: sid
			}) );
			this.connections[sid] = new testLoad(context, this, options );
			this.connections[sid].requests( start  );
		}else{
			var sid = options.sid ;
			this.connections[sid].context = null ;
			this.connections[sid].context = context ;
		}
		context.listen(this,"onClose", function(){
			this.connections[sid].stop(sid);
		})
				
	
	};


	return service ;

})
