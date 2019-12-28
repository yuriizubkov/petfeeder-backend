(window["webpackJsonp"]=window["webpackJsonp"]||[]).push([["events"],{aa9c:function(e,t,a){"use strict";a.r(t);var n=function(){var e=this,t=e.$createElement,a=e._self._c||t;return a("v-container",{attrs:{fluid:""}},[a("v-row",{attrs:{align:"center",justify:"center"}},[a("v-col",{staticClass:"pl-1 pr-1 pt-0",attrs:{cols:"12",md:"8"}},[a("v-card",{attrs:{disabled:e.loadingDbDates||e.loadingEvents,loading:e.loadingDbDates}},[a("v-container",{staticClass:"pb-0"},[a("v-row",[a("v-col",{staticClass:"pb-0"},[a("v-select",{attrs:{dense:"",label:"Year",items:e.years},model:{value:e.yearSelected,callback:function(t){e.yearSelected=t},expression:"yearSelected"}})],1),a("v-col",{staticClass:"pb-0"},[a("v-select",{attrs:{dense:"",label:"Month",items:e.months},model:{value:e.monthSelected,callback:function(t){e.monthSelected=t},expression:"monthSelected"}})],1),a("v-col",{staticClass:"pb-0"},[a("v-select",{attrs:{dense:"",label:"Date (UTC)",items:e.dates},model:{value:e.dateSelected,callback:function(t){e.dateSelected=t},expression:"dateSelected"}})],1)],1)],1)],1)],1)],1),e.loadingEvents?a("v-row",{attrs:{align:"center",justify:"center"}},[a("v-col",{staticClass:"text-center",attrs:{cols:"6"}},[a("v-progress-circular",{attrs:{size:70,width:7,indeterminate:""}})],1)],1):a("v-row",{attrs:{align:"center",justify:"center"}},[a("v-col",{staticClass:"pl-1 pr-1 pt-0",attrs:{cols:"12",md:"8"}},[e.eventList&&e.eventList.length>0?a("v-list",{attrs:{dense:"",subheader:""}},e._l(e.eventList,(function(t,n){return a("v-list-item",{key:n,staticClass:"pl-1"},[a("v-list-item-avatar",{staticClass:"pa-0 mr-0"},[a("v-icon",{domProps:{textContent:e._s(e.getIconClass(t))}})],1),a("v-list-item-content",[a("v-list-item-title",[e._v(e._s(n+1)+". "+e._s(e.getFriendlyType(t)))]),a("v-list-item-subtitle",[e._v(e._s(e.getDateString(t))+" (GMT "+e._s(-e.timezoneOffset>=0?"+":"-")+e._s(-e.timezoneOffset)+")")])],1)],1)})),1):e._e(),e.loadingEvents||e.eventList&&0!==e.eventList.length?e._e():a("div",{staticClass:"text-center"},[e._v("So quiet here...")])],1)],1)],1)},s=[],r=(a("a4d3"),a("99af"),a("4de4"),a("4160"),a("d81d"),a("0d03"),a("e439"),a("dbb4"),a("b64b"),a("d3b7"),a("e25e"),a("159b"),a("2fa7")),c=(a("96cf"),a("2f62")),i=a("6b27");function o(e,t){var a=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),a.push.apply(a,n)}return a}function l(e){for(var t=1;t<arguments.length;t++){var a=null!=arguments[t]?arguments[t]:{};t%2?o(a,!0).forEach((function(t){Object(r["a"])(e,t,a[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(a)):o(a).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(a,t))}))}return e}var d={data:function(){var e=new Date;return{todayDate:e,yearSelected:e.getUTCFullYear(),monthSelected:e.getUTCMonth()+1,dateSelected:e.getUTCDate(),timezoneOffset:(new Date).getTimezoneOffset()/60,loadingEvents:!0,loadingDbDates:!0}},watch:{dateSelected:function(){return regeneratorRuntime.async((function(e){while(1)switch(e.prev=e.next){case 0:return e.next=2,regeneratorRuntime.awrap(this.getEvents(this.yearSelected,this.monthSelected,this.dateSelected));case 2:case"end":return e.stop()}}),null,this)}},computed:l({},Object(c["d"])(["eventList","eventDates"]),{years:function(){return this.eventDates&&0!==Object.keys(this.eventDates).length?Object.keys(this.eventDates).map((function(e){return{text:e,value:parseInt(e)}})):[{text:this.yearSelected,value:this.yearSelected}]},months:function(){return this.eventDates[this.yearSelected]?Object.keys(this.eventDates[this.yearSelected]).map((function(e){return{text:Object(i["a"])(e),value:parseInt(e)}})):[{text:Object(i["a"])(this.monthSelected),value:this.monthSelected}]},dates:function(){var e=this;return this.eventDates[this.yearSelected]&&this.eventDates[this.yearSelected][this.monthSelected]?Object.keys(this.eventDates[this.yearSelected][this.monthSelected]).map((function(t){return{text:"".concat(Object(i["a"])(t)," (").concat(e.eventDates[e.yearSelected][e.monthSelected][t]," events)"),value:parseInt(t)}})):[{text:Object(i["a"])(this.dateSelected),value:this.dateSelected}]}}),methods:l({nf:i["a"]},Object(c["c"])(["setEvents","setTitle"]),{},Object(c["b"])(["showSnackbar"]),{getIconClass:function(e){var t;switch(e.type){case"feeding":t="mdi-food";break;case"clocksync":t="mdi-clock";break;case"warning":t="mdi-alert";break}return t},getFriendlyType:function(e){var t=e.type;switch(e.type){case"feeding":t="Feeding. Issued portions: ".concat(e.data.issuedPortions,", ").concat(e.data.scheduled?"Auto":"Manual").concat(e.data.issuedPortions<e.data.scheduledPortions?". Motor stuck!":"");break;case"clocksync":t="Clock synchronization";break;case"warning":switch(e.data.type){case"nofood":t="Warning. No food left!";break;default:t=JSON.stringify(e);break}break;default:t=JSON.stringify(e);break}return t},getDateString:function(e){var t=new Date(e.id);return"".concat(t.getFullYear(),".").concat(Object(i["a"])(t.getMonth()+1),".").concat(Object(i["a"])(t.getDate())," ").concat(Object(i["a"])(t.getHours()),":").concat(Object(i["a"])(t.getMinutes()),":").concat(Object(i["a"])(t.getSeconds()))},getEvents:function(e,t,a){return regeneratorRuntime.async((function(n){while(1)switch(n.prev=n.next){case 0:return this.loadingEvents=!0,n.prev=1,this.$store.commit("setEvents",[]),n.next=5,regeneratorRuntime.awrap(this.$store.dispatch("getEvents",{year:e,month:t,date:a}));case 5:n.next=11;break;case 7:n.prev=7,n.t0=n["catch"](1),console.error("getEvents error:",n.t0),this.$store.dispatch("showSnackbar",{text:n.t0,timeout:1e4});case 11:this.loadingEvents=!1;case 12:case"end":return n.stop()}}),null,this,[[1,7]])},getEventDates:function(){return regeneratorRuntime.async((function(e){while(1)switch(e.prev=e.next){case 0:return this.loadingDbDates=!0,e.prev=1,e.next=4,regeneratorRuntime.awrap(this.$store.dispatch("getEventDates"));case 4:e.next=10;break;case 6:e.prev=6,e.t0=e["catch"](1),console.error("getEventDates error:",e.t0),this.$store.dispatch("showSnackbar",{text:e.t0,timeout:1e4});case 10:this.loadingDbDates=!1;case 11:case"end":return e.stop()}}),null,this,[[1,6]])}}),created:function(){return regeneratorRuntime.async((function(e){while(1)switch(e.prev=e.next){case 0:this.setTitle("Events"),this.getEvents(this.yearSelected,this.monthSelected,this.dateSelected),this.getEventDates();case 3:case"end":return e.stop()}}),null,this)}},u=d,h=a("2877"),v=a("6544"),b=a.n(v),p=a("b0af"),g=a("62ad"),f=a("a523"),m=a("132d"),y=a("8860"),S=a("da13"),w=a("8270"),O=a("5d23"),D=a("490a"),j=a("0fd9"),k=a("b974"),x=Object(h["a"])(u,n,s,!1,null,null,null);t["default"]=x.exports;b()(x,{VCard:p["a"],VCol:g["a"],VContainer:f["a"],VIcon:m["a"],VList:y["a"],VListItem:S["a"],VListItemAvatar:w["a"],VListItemContent:O["a"],VListItemSubtitle:O["b"],VListItemTitle:O["c"],VProgressCircular:D["a"],VRow:j["a"],VSelect:k["a"]})}}]);
//# sourceMappingURL=events.469d2d9f.js.map