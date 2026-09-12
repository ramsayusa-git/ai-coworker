package com.aetostechlabs.aetosonehealth

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aetostechlabs.aetosonehealth.ble.blePermissions
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.StatusPill
import com.aetostechlabs.aetosonehealth.ui.screens.BpScreen
import com.aetostechlabs.aetosonehealth.ui.screens.EcgScreen
import com.aetostechlabs.aetosonehealth.ui.screens.HistoryScreen
import com.aetostechlabs.aetosonehealth.ui.screens.ProfilesScreen
import com.aetostechlabs.aetosonehealth.ui.theme.AetosOneTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AetosOneTheme {
                Surface(
                    Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) { AetosOneApp() }
            }
        }
    }
}

private enum class Dest(val label: String) { ECG("ECG"), BP("Blood pressure"), HISTORY("History"), PROFILE("Profiles") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AetosOneApp(vm: MonitorViewModel = viewModel()) {
    var dest by remember { mutableIntStateOf(0) }
    val snackbar = remember { SnackbarHostState() }
    val message by vm.message.collectAsState()
    val ecgState by vm.ecg.state.collectAsState()
    val bpState by vm.bp.state.collectAsState()
    val active by vm.activeProfile.collectAsState()

    // Permissions are asked for once, on first launch. Without them the scan
    // silently returns nothing, which would look exactly like a sleeping device.
    val permissions = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }
    LaunchedEffect(Unit) {
        val wanted = blePermissions().toMutableList()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            wanted += Manifest.permission.POST_NOTIFICATIONS
        permissions.launch(wanted.toTypedArray())
    }

    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            vm.clearMessage()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painter = painterResource(R.drawable.aetos_logo),
                            contentDescription = "Aetos One",
                            modifier = Modifier.size(30.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(
                                "Aetos One Health",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                active?.name ?: "No profile selected",
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                },
                actions = {
                    StatusPill(if (dest == 1) bpState else ecgState)
                    Spacer(Modifier.width(12.dp))
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        bottomBar = {
            NavigationBar {
                Dest.entries.forEachIndexed { i, d ->
                    NavigationBarItem(
                        selected = dest == i,
                        onClick = { dest = i },
                        icon = {
                            Icon(
                                when (d) {
                                    Dest.ECG -> Icons.Filled.MonitorHeart
                                    Dest.BP -> Icons.Filled.Favorite
                                    Dest.HISTORY -> Icons.Filled.History
                                    Dest.PROFILE -> Icons.Filled.Person
                                },
                                contentDescription = d.label
                            )
                        },
                        label = { Text(d.label, maxLines = 1) }
                    )
                }
            }
        }
    ) { pad ->
        Column(
            Modifier.fillMaxWidth().padding(pad),
            verticalArrangement = Arrangement.Top
        ) {
            when (Dest.entries[dest]) {
                Dest.ECG -> EcgScreen(vm)
                Dest.BP -> BpScreen(vm)
                Dest.HISTORY -> HistoryScreen(vm)
                Dest.PROFILE -> ProfilesScreen(vm)
            }
        }
    }
}
