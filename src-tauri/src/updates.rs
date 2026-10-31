//! Whether this copy of the app can replace itself with a new version.

use tauri::utils::config::BundleType;

/// The Linux package this copy was installed from, or null when it can update
/// itself. The interface links a package install to its download instead.
#[tauri::command]
pub fn package_install_kind() -> Option<&'static str> {
    package_install(
        std::env::consts::OS,
        std::env::var_os("APPIMAGE").is_some(),
        tauri::utils::platform::bundle_type() == Some(BundleType::Rpm),
    )
}

/// A `.deb` or `.rpm` install is owned by the system's package manager, so the
/// app must not overwrite it. Only an AppImage sets `APPIMAGE` when it runs.
pub fn package_install(os: &str, appimage: bool, rpm: bool) -> Option<&'static str> {
    if os != "linux" || appimage {
        None
    } else if rpm {
        Some("rpm")
    } else {
        Some("deb")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mac_and_windows_copies_update_themselves() {
        assert_eq!(package_install("macos", false, false), None);
        assert_eq!(package_install("windows", false, false), None);
    }

    #[test]
    fn an_appimage_updates_itself() {
        assert_eq!(package_install("linux", true, false), None);
    }

    #[test]
    fn a_linux_package_install_names_its_package() {
        assert_eq!(package_install("linux", false, false), Some("deb"));
        assert_eq!(package_install("linux", false, true), Some("rpm"));
    }
}
