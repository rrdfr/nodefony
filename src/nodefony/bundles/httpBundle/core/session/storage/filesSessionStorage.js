/*
 *
 *
 *
 *
 *
 */
var mkdirp = require('mkdirp');

nodefony.register.call(nodefony.session.storage, "files",function(){

	var finderGC = function(path, msMaxlifetime ,context){
		var nbSessionsDelete  = 0 ;
		var finder = new nodefony.finder({
			path:path,
			onFile:function(file){
				var mtime = new Date( file.stats.mtime ).getTime();
				if ( mtime + msMaxlifetime < new Date().getTime() ){
					file.unlink();
					this.manager.logger("FILES SESSIONS STORAGE GARBADGE COLLECTOR SESSION context : "+context+" ID : "+ file.name + " DELETED");
					nbSessionsDelete++;
				}
			}.bind(this),
			onFinish:function(error, result){
				this.manager.logger("FILES SESSIONS STORAGE context : "+ ( context || "default" ) +" GARBADGE COLLECTOR ==> "+ nbSessionsDelete + " DELETED")			
			}.bind(this)
		});
		return finder;	
	}

	var fileSessionStorage = class fileSessionStorage {
		constructor (manager){
			this.manager = manager ;
			this.path = manager.settings.save_path;
			this.gc_maxlifetime = manager.settings.gc_maxlifetime ;
			this.contextSessions = [];
		};

		start (id, contextSession, callback){
			var fileSession  = null ;	
			if ( contextSession ){
				var path = this.path+"/"+contextSession+"/"+id ;	
			}else{
				var path = this.path+"/"+id ;
			}
			try {
				fileSession = new nodefony.fileClass(path);
				this.read(fileSession, callback);

			}catch(e){
				callback(e, null) ;
			}
		};

		open (contextSession){
			if (contextSession) {
				var path = this.path+"/"+contextSession ;
				this.contextSessions.push(contextSession);
			}else{
				var path = this.path ;
			}
			var res = fs.existsSync(path);
			if (! res ){
				this.manager.logger("create directory context sessions " + path);
				try {
					//var res = fs.mkdirSync(path);
					var res = mkdirp.sync(path)
				}catch(e){
					throw e ;
				}
			}else{
				this.gc(this.gc_maxlifetime, contextSession);
				this.finder = new nodefony.finder({
					path:path,
					recurse:false,
					onFinish:function(error, result){
						this.manager.logger("CONTEXT "+( contextSession ? contextSession : "GLOBAL" )+" SESSIONS STORAGE  ==>  " + this.manager.settings.handler.toUpperCase() + " COUNT SESSIONS : "+result.length() );
					}.bind(this)
				});
			}
			return true;
		};

		close (){
			this.gc(this.gc_maxlifetime);
			return true;
		};

		destroy (id, contextSession){
			var fileDestroy  = null ;
			if ( contextSession ){
				var path = this.path+"/"+contextSession+"/"+id ;	
			}else{
				var path = this.path+"/"+id ;
			}
			try {
				fileDestroy = new nodefony.fileClass(path);
				this.manager.logger("FILES SESSIONS STORAGE DESTROY SESSION context : "+contextSession +" ID : "+ fileDestroy.name + " DELETED");
				return fileDestroy.unlink();

			}catch(e){
				return false ;
			}
		};

	
		gc (maxlifetime, contextSession){
			var msMaxlifetime = ( (maxlifetime || this.gc_maxlifetime) * 1000);
			if ( contextSession ){
				var path = this.path+"/"+contextSession ;
				finderGC.call(this, path , msMaxlifetime, contextSession)	
			}else{
				//finderGC.call(this, this.path , msMaxlifetime)	
				if (this.contextSessions.length){
					for (var i = 0 ; i<this.contextSessions.length ; i++){
						finderGC.call(this, this.path+"/"+this.contextSessions[i] , msMaxlifetime , this.contextSessions[i]);	
					}
				}
			}
		};

		read (file, callback){
			var id = file.name;
			try {
				var res = fs.readFileSync(file.path, {
					encoding:'utf8'
				});
				//this.manager.logger("FILES SESSIONS STORAGE READ ==> "+ file.name)
				callback(null, JSON.parse(res) ); 
			}catch(e){
				this.manager.logger("FILES SESSIONS STORAGE READ  ==> "+ e,"ERROR")	
				callback(e, null );
			}	
		};

		write (fileName, serialize, contextSession, callback){
			if ( contextSession ){
				var path = this.path+"/"+contextSession+"/"+fileName ;	
			}else{
				var path = this.path+"/"+fileName ;
			}
			try{
				fs.writeFileSync(path, JSON.stringify(serialize));
				//this.manager.logger("FILES SESSIONS STORAGE  WRITE SESSION : " + fileName);
				callback(null, serialize)
			}catch(e){
				this.manager.logger("FILES SESSIONS STORAGE : "+ e,"ERROR");
				callback( e, null );
			} 
		};
	};
	
	return fileSessionStorage ;
})
