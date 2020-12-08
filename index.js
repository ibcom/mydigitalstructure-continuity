/*
	mydigitalstructure Continuity example app for an organisation;
	- https://docs.mydigitalstructure.cloud/gettingstarted_continuity

	Design Notes:

	# You need to set up a user role with access to:
	LOGON, CORE_GET_USER_DETAILS, CORE_DATA_TRACKING_SEARCH, SETUP_SPACE_SETTINGS_SEARCH, SETUP_SPACE_SETTINGS_MANAGE
	& any data objects that you want to back up.
	
  	To run local use https://www.npmjs.com/package/lambda-local:

	lambda-local -l index.js -t 9000 -e event-continuity-get-last-backup-date.json
	 - Get last back up date

	lambda-local -l index.js -t 9000 -e event-continuity-reset-last-backup-date.json
	 - Reset last back up date

	lambda-local -l index.js -t 9000 -e event-continuity-get-tracking-data.json
	 - Get tracking data

	lambda-local -l index.js -t 9000 -e event-continuity-backup-object-data.json
	 - !!! The main controller that does the back up
	
	Notes:

	# context: this the context of the lambda job runtime info
*/

exports.handler = function (event, context, callback)
{
	var mydigitalstructure = require('mydigitalstructure')
	var _ = require('lodash')
	var moment = require('moment');

	mydigitalstructure.set(
	{
		scope: '_event',
		value: event
	});

	mydigitalstructure.set(
	{
		scope: '_context',
		value: context
	});

	mydigitalstructure.set(
	{
		scope: '_callback',
		value: callback
	});

	mydigitalstructure.init(main);

	function main(err, data)
	{
		mydigitalstructure.add(
		{
			name: 'continuity-start',
			code: function (param)
			{
				var event = mydigitalstructure.get(
				{
					scope: '_event'
				});

				var settings = mydigitalstructure.get(
				{
					scope: '_settings'
				});

				var controller;

				if (_.isObject(event))
				{
					controller = event.controller;
				}

				if (controller != undefined)
				{
					mydigitalstructure._util.message(
					[
						'-',
						'Using mydigitalstructure module version ' + mydigitalstructure.VERSION,
						'-',
						'Settings:',
						settings,
						'-',
						'Based on event data invoking controller:',
						controller
					]);

					mydigitalstructure.invoke(controller);
				}
			}
		});

		//--- GET LAST BACKUP REFERENCE DATE FROM YOUR MYDIGITALSTRUCTURE.CLOUD SPACE SETTINGS

		mydigitalstructure.add(
		[
			{
				name: 'continuity-get-last-backup-date',
				code: function (param)
				{
					mydigitalstructure.cloud.search(
					{
						object: 'setup_space_settings',
						fields: [{ name: 'datatrackinglastbackupdate' }],
						callback: 'continuity-get-last-backup-date-response',
						callbackParam: param
					});
				}
			},
			{
				name: 'continuity-get-last-backup-date-response',
				code: function (param, response)
				{
					if (response.status == 'OK')
					{
						mydigitalstructure.set(
						{
							scope: 'continuity',
							context: 'space-settings',
							value: _.first(response.data.rows)
						});

						var lastBackupDate = mydigitalstructure.set(
						{
							scope: 'continuity-get-last-backup-date',
							context: 'last-backup-date',
							value: _.first(response.data.rows).datatrackinglastbackupdate
						});

						mydigitalstructure._util.message(
						[
							'-',
							'Last backup date:',
							lastBackupDate
						]);

						var onComplete = mydigitalstructure._util.param.get(param, 'onComplete').value;

						if (onComplete != undefined)
						{
							mydigitalstructure._util.onComplete(param);
						}
						else
						{
							mydigitalstructure.invoke('util-end',
							{
								status: 'OK',
								lastBackupDate: lastBackupDate
							});
						}
					}
				}
			}
		]);

		//--- GET TRACKING DATA FROM MYDIGITALSTRUCTURE.CLOUD

		mydigitalstructure.add(
		[
			{
				name: 'continuity-get-tracking-data',
				code: function (param)
				{
					mydigitalstructure.invoke('continuity-get-last-backup-date',
					{
						onComplete: 'continuity-get-tracking-data-process'
					})
				}
			},
			{
				name: 'continuity-get-tracking-data-process',
				code: function (param)
				{
					var settings = mydigitalstructure.get(
					{
						scope: '_settings'
					});

					//use for settings.continuity.objects.include / exclude

					var lastBackupDate = mydigitalstructure.get(
					{
						scope: 'continuity-get-last-backup-date',
						context: 'last-backup-date'
					});

					var filters = [];

					if (settings.continuity.filters != undefined)
					{
						filters = _.concat(filters, settings.continuity.filters)
					}

					if (lastBackupDate != '' && lastBackupDate != undefined)
					{
						filters.push(
						{
							field: 'modifieddate',
							comparison: 'GREATER_THAN_OR_EQUAL_TO',
							value: lastBackupDate
						});
					}

					if (settings.continuity.objects != undefined)
					{
						if (settings.continuity.objects.include != undefined)
						{
							filters.push(
							{
								field: 'object',
								comparison: 'IN_LIST',
								value: settings.continuity.objects.include
							});
						}
						else if (settings.continuity.objects.exclude != undefined)
						{
							filters.push(
							{
								field: 'object',
								comparison: 'NOT_IN_LIST',
								value: settings.continuity.objects.exclude
							});
						}
					}

					mydigitalstructure.cloud.search(
					{
						object: 'core_data_tracking',
						fields:
						[
							{name: 'object'},
							{name: 'objecttext'},
							{name: 'objectcontext'},
							{name: 'modifieddate'},
							{name: 'modifieduser'},
							{name: 'modifiedusertext'},
							{name: 'session'},
							{name: 'guid'}
						],
						filters: filters,
						sorts: [{name: 'id', direction: 'asc'}],
						callback: 'continuity-get-tracking-data-process-response',
						callbackParam: param
					});
				}
			},
			{
				name: 'continuity-get-tracking-data-process-response',
				code: function (param, response)
				{
					if (response.status == 'OK')
					{
						var trackingData = mydigitalstructure.set(
						{
							scope: 'continuity-get-tracking-data-process',
							context: 'data',
							value: response.data.rows
						});

						mydigitalstructure.set(
						{
							scope: 'continuity-get-tracking-data-process',
							context: 'data-count',
							value: response.data.rows.length
						});

						mydigitalstructure._util.message(
						[
							'-',
							'Tracking Data:',
							trackingData
						]);

						var lastTrackingData;

						if (trackingData.length != 0)
						{
							lastTrackingData = _.last(trackingData)
						}

						var trackingLastBackupDate = mydigitalstructure.set(
						{
							scope: 'continuity-get-tracking-data-process',
							context: 'last-backup-date',
							value: lastTrackingData.modifieddate
						});
					}

					mydigitalstructure.invoke('continuity-backup-object-data');
				}
			}
		]);

		//--- SET LAST BACKUP REFERENCE DATE ON YOUR SPACE SETTINGS IN MYDIGITALSTRUCTURE.CLOUD

		mydigitalstructure.add(
		[
			{
				name: 'continuity-set-last-backup-date',
				code: function (param)
				{
					var trackingLastBackupDate = mydigitalstructure.get(
					{
						scope: 'continuity-get-tracking-data-process',
						context: 'last-backup-date'
					});

					if (trackingLastBackupDate != undefined)
					{
						var spaceSettings = mydigitalstructure.get(
						{
							scope: 'continuity',
							context: 'space-settings'
						});

						mydigitalstructure.cloud.save(
						{
							object: 'setup_space_settings',
							data:
							{ 
								id: spaceSettings.id,
								datatrackinglastbackupdate: trackingLastBackupDate
							},
							callback: 'continuity-set-last-backup-date-response',
							callbackParam: param
						});
					}
				}
			},
			{
				name: 'continuity-set-last-backup-date-response',
				code: function (param, response)
				{
					if (response.status == 'OK')
					{
						var onComplete = mydigitalstructure._util.param.get(param, 'onComplete').value;

						if (onComplete != undefined)
						{
							mydigitalstructure._util.onComplete(param);
						}
						else
						{
							mydigitalstructure.invoke('util-end');
						}
					}
				}
			}
		]);

		//--- RESET LAST BACKUP REFERENCE DATE ON YOUR SPACE SETTINGS

		mydigitalstructure.add(
		{
			name: 'continuity-reset-last-backup-date',
			code: function (param)
			{
				mydigitalstructure.cloud.save(
				{
					object: 'setup_space_settings',
					data:
					{ 
						datatrackinglastbackupdate: ''
					}
				});
			}
		});

		mydigitalstructure.add(
		{
			name: 'util-end',
			code: function (data, error)
			{
				var callback = mydigitalstructure.get(
				{
					scope: '_callback'
				});

				if (error == undefined) {error = null}

				if (data == undefined)
				{
					var trackingProcessData = mydigitalstructure.get(
					{
						scope: 'continuity-get-tracking-data-process'
					});

					data =
					{
						status: 'OK',
						trackingDataCount: trackingProcessData['data-count'],
						trackingLastBackupDate: trackingProcessData['last-backup-date']
					}
				}

				if (callback != undefined)
				{
					callback(error, data);
				}
			}
		});

		//--- GET OBJECT DATA FROM MYDS AND BACK UP
		//Now that you have data - save to your own data store - ie AWS S3, DynamoDB ....
		//You can use settings.local to store your own parameters

		mydigitalstructure.add(
		{
			name: 'continuity-backup-object-data',
			notes: 'This is the code you use to get data and save to your local code',
			code: function (data, error)
			{
				var trackingProcessData = mydigitalstructure.get(
				{
					scope: 'continuity-get-tracking-data-process'
				});

				mydigitalstructure.invoke('util-end');

				//When done call: mydigitalstructure.invoke('continuity-set-last-backup-date');
			}
		});

		mydigitalstructure.invoke('continuity-start');
	}
}