import eventManager from '../../../eventManager';
import Setting, { SettingItem as InternalSettingItem, SettingSectionSource } from '../../../models/Setting';
import Plugin from '../Plugin';
import { SettingItem, SettingSection } from './types';

export interface ChangeEvent {
	/**
	 * Setting keys that have been changed
	 */
	keys: string[];
}

export type ChangeHandler = (event: ChangeEvent)=> void;

/**
 * This API allows registering new settings and setting sections, as well as getting and setting settings. Once a setting has been registered it will appear in the config screen and be editable by the user.
 *
 * Settings are essentially key/value pairs.
 *
 * Note: Currently this API does **not** provide access to Joplin's built-in settings. This is by design as plugins that modify user settings could give unexpected results
 *
 * [View the demo plugin](https://github.com/laurent22/joplin/tree/dev/packages/app-cli/tests/support/plugins/settings)
 */
export default class JoplinSettings {
	private plugin_: Plugin = null;

	public constructor(plugin: Plugin) {
		this.plugin_ = plugin;
	}

	private get keyPrefix(): string {
		return `plugin-${this.plugin_.id}.`;
	}

	// Ensures that the plugin settings and sections are within their own namespace, to prevent them from
	// overwriting other plugin settings or the default settings.
	private namespacedKey(key: string): string {
		return `${this.keyPrefix}${key}`;
	}

	/**
	 * Registers new settings.
	 * Note that registering a setting item is dynamic and will be gone next time Joplin starts.
	 * What it means is that you need to register the setting every time the plugin starts (for example in the onStart event).
	 * The setting value however will be preserved from one launch to the next so there is no risk that it will be lost even if for some
	 * reason the plugin fails to start at some point.
	 */
	public async registerSettings(settings: Record<string, SettingItem>) {
		for (const [key, setting] of Object.entries(settings)) {
			const internalSettingItem: InternalSettingItem = {
				key: key,
				value: setting.value,
				type: setting.type,
				public: setting.public,
				label: () => setting.label,
				description: (_appType: string) => setting.description,
			};

			if ('isEnum' in setting) internalSettingItem.isEnum = setting.isEnum;
			if ('section' in setting) internalSettingItem.section = this.namespacedKey(setting.section);
			if ('options' in setting) internalSettingItem.options = () => setting.options;
			if ('appTypes' in setting) internalSettingItem.appTypes = setting.appTypes;
			if ('secure' in setting) internalSettingItem.secure = setting.secure;
			if ('advanced' in setting) internalSettingItem.advanced = setting.advanced;
			if ('minimum' in setting) internalSettingItem.minimum = setting.minimum;
			if ('maximum' in setting) internalSettingItem.maximum = setting.maximum;
			if ('step' in setting) internalSettingItem.step = setting.step;
			if ('storage' in setting) internalSettingItem.storage = setting.storage;

			await Setting.registerSetting(this.namespacedKey(key), internalSettingItem);
		}
	}

	/**
	 * @deprecated Use joplin.settings.registerSettings()
	 *
	 * Registers a new setting.
	 */
	public async registerSetting(key: string, settingItem: SettingItem) {
		this.plugin_.deprecationNotice('1.8', 'joplin.settings.registerSetting() is deprecated in favour of joplin.settings.registerSettings()', true);
		await this.registerSettings({ [key]: settingItem });
	}

	/**
	 * Registers a new setting section. Like for registerSetting, it is dynamic and needs to be done every time the plugin starts.
	 */
	public async registerSection(name: string, section: SettingSection) {
		return Setting.registerSection(this.namespacedKey(name), SettingSectionSource.Plugin, section);
	}

	/**
	 * Gets a setting value (only applies to setting you registered from your plugin)
	 */
	public async value(key: string): Promise<any> {
		return Setting.value(this.namespacedKey(key));
	}

	/**
	 * Sets a setting value (only applies to setting you registered from your plugin)
	 */
	public async setValue(key: string, value: any) {
		return Setting.setValue(this.namespacedKey(key), value);
	}

	/**
	 * Gets a global setting value, including app-specific settings and those set by other plugins.
	 *
	 * The list of available settings is not documented yet, but can be found by looking at the source code:
	 *
	 * https://github.com/laurent22/joplin/blob/dev/packages/lib/models/Setting.ts#L142
	 */
	public async globalValue(key: string): Promise<any> {
		return Setting.value(key);
	}

	/**
	 * Called when one or multiple settings of your plugin have been changed.
	 * - For performance reasons, this event is triggered with a delay.
	 * - You will only get events for your own plugin settings.
	 */
	public async onChange(handler: ChangeHandler): Promise<void> {
		// Filter out keys that are not related to this plugin
		eventManager.on('settingsChange', (event: ChangeEvent) => {
			const keys = event.keys
				.filter(k => k.indexOf(this.keyPrefix) === 0)
				.map(k => k.substr(this.keyPrefix.length));
			if (!keys.length) return;
			handler({ keys });
		});
	}
}
