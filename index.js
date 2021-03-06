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

	# Save to dynamoDB
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
							comparison: 'GREATER_THAN',
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
							lastTrackingData = _.last(trackingData);
							var lastBackupDate = lastTrackingData.modifieddate;
						
							var trackingLastBackupDate = mydigitalstructure.set(
							{
								scope: 'continuity-get-tracking-data-process',
								context: 'last-backup-date',
								value: lastBackupDate
							});
						}
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
		// Now that you have the tracking data - you search for the data you want to save to your own data store - ie AWS S3, DynamoDB ....
		// You can use settings.local to store your own parameters
		// You can similar methods as used at https://learn.mydigitalstructure.cloud/schema to get available fields etc

		mydigitalstructure.add(
		[
			{
				name: 'continuity-backup-object-data',
				notes: 'This is the code you use to get data and save to your local code',
				code: function (param, response)
				{
					var trackingProcessData = mydigitalstructure.get(
					{
						scope: 'continuity-get-tracking-data-process',
						context: 'data'
					});

					var trackingProcessDataByObject = _.groupBy(trackingProcessData, function (data) {return data.object});

					var trackingBackups = [];

					_.each(trackingProcessDataByObject, function (objectData, object)
					{
						trackingBackups.push(
						{
							object: object,
							objectcontexts: _.join(_.map(objectData, function (_objectData) {return _objectData.objectcontext}), ',')
						})
					});

					mydigitalstructure._util.message(
					[
						'Tracking backups:',
						trackingBackups
					]);

					mydigitalstructure.set(
					{
						scope: 'continuity-backup-object-data',
						context: 'tracking-backups',
						value: trackingBackups
					});

					mydigitalstructure.set(
					{
						scope: 'continuity-backup-object-data',
						context: 'tracking-backups-index',
						value: 0
					});

					mydigitalstructure.invoke('continuity-backup-object-data-process')
				}
			},
			{
				name: 'continuity-backup-object-data-process',
				code: function (param, response)
				{
					var index = mydigitalstructure.get(
					{
						scope: 'continuity-backup-object-data',
						context: 'tracking-backups-index'
					});

					var trackingBackups = mydigitalstructure.get(
					{
						scope: 'continuity-backup-object-data',
						context: 'tracking-backups'
					});

					if (index < trackingBackups.length)
					{
						var trackingBackup = trackingBackups[index];

						// Can use CORE_OBJECT_SEARCH &advancedsearchmethod to get method details to get data
						// In this example it is coded.

						var searchData =
						{
							callback: 'continuity-backup-object-data-next',
							callbackParam: param,
							rows: 9999999
						};

						if (trackingBackup.object == 32)
						{
							searchData.object = 'contact_person';
							searchData.fields = 
							[
								{name: 'firstname'},
								{name: 'surname'},
								{name: 'email'}
							];
							searchData.filters =
							[
								{
									name: 'id',
									comparison: 'IN_LIST',
									values: searchData.objectcontexts
								}
							]
						}

						mydigitalstructure.cloud.search(searchData);
					}
					else
					{
						//For testing; mydigitalstructure.invoke('util-end');
						mydigitalstructure.invoke('continuity-set-last-backup-date');
					}
				}
			},
			{
				name: 'continuity-backup-object-data-next',
				code: function (param, response)
				{
					//use response object to save your data

					var index = mydigitalstructure.get(
					{
						scope: 'continuity-backup-object-data',
						context: 'tracking-backups-index'
					});

					mydigitalstructure.set(
					{
						scope: 'continuity-backup-object-data',
						context: 'tracking-backups-index',
						value: (index + 1)
					});

					mydigitalstructure.invoke('continuity-backup-object-data-process')
				}
			}
		]);

		mydigitalstructure.invoke('continuity-start');
	}
}