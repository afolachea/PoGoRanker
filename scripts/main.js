var app = angular.module('myApp', []);
app.controller('MainController', function($scope, $timeout, $anchorScroll, $filter) {
    const GYM_QUICK_ATTACK_DELAY = 2;
    const SPECIAL_ATTACK_HOLD_DELAY = 0.5;
    const SE_FACTOR = 1.25;
    const NVE_FACTOR = 0.8;
    const STAB_FACTOR = 1.25;
    const CRIT_FACTOR = 1.25;
    const CUMULATIVE_TYPE_ADVANTAGE = true;
    const INCLUDE_OLD_MOVESETS = true;
    const NEUTRAL = '';
    
    var pokemonList = data.pokemonList;
    var quickMovesList = data.quickMovesList;
    var specialMovesList = data.specialMovesList;
    var typesChart = data.typesChart;
    var changes = data.changes;
    
    var stands = [{name:'offensive', factor:0},{name:'defensive', factor:1}];
    var maxScore = {offensive: 1, defensive: 1};
    var unavailable = {'Mewtwo':0,'Mew':0,'Articuno':0,'Moltres':0,'Zapdos':0,'Ditto':0};

    $scope.donate = false;
    $scope.sorry = true;
    $scope.showOpponentMovesets = false;

    $scope.typeFilters = {};
    $scope.selected = {
        info: null,
        typeFilters: [],
        filters: {
            type: true
        },
        sorter: null,
        movesetSorter: null,
        stand: 'offensive',
        reference: 'by-score',
        pokemon: null,
        types: [],
        opponent: {
            pokemon: null,
            moveset: null
        }
    };
    $scope.maxTotalPower = {};
    $scope.pokemonByType = {};
    $scope.typeGroups = {};
    $scope.filteredBy = [];

    var quickMoves = listToMap(quickMovesList);
    var specialMoves = listToMap(specialMovesList);
    var pokemon = listToMap(pokemonList);
    $scope.pokemon = pokemon;

    var typesList = [];
    for (var off_type in typesChart) {
        $scope.typeFilters[off_type] = false;
        typesList.push({
            name: off_type,
            superEffectiveAgainst: [],
            notVeryEffectiveAgainst: [],
            regularEffectiveAgainst: [],
            weakTo: [],
            resistantTo: [],
            regularDamagedBy: []
        });
    }
    var types = listToMap(typesList);

    for (var off_type in typesChart) {
        for (var def_type in typesChart[off_type]) {
            if (typesChart[off_type][def_type] > 1) {
                types[off_type].superEffectiveAgainst.push(def_type);
                types[def_type].weakTo.push(off_type);
            }
            else if (typesChart[off_type][def_type] < 1) {
                types[off_type].notVeryEffectiveAgainst.push(def_type);
                types[def_type].resistantTo.push(off_type);
            }
            else {
                types[off_type].regularEffectiveAgainst.push(def_type);
                types[def_type].regularDamagedBy.push(off_type);
            }
        }
    }

    for (var pkmn of pokemonList) {
        pkmn.display = false;
        pkmn.position = 0;
        pkmn.num = ('00'+pkmn.number).slice(-3);
        pkmn.movesetsList = [];
        pkmn.maxDPS = {
            against: {}
        };
        pkmn.maxScore = {};
        pkmn.totalPower = {};
        pkmn.base = {
            score: {},
            totalPower: {}
        };
        pkmn.baseTotalPower = {
            offensive: pkmn.stats.attack * pkmn.stats.defense * pkmn.stats.stamina / 250000,
            defensive: 2 * pkmn.stats.attack * pkmn.stats.defense * pkmn.stats.stamina / 250000
        }

        pkmn.quickMoves = pkmn.quickMoves.map(qm => quickMoves[qm]);
        pkmn.specialMoves = pkmn.specialMoves.map(sm => specialMoves[sm]);

        var changedMoves = changes[pkmn.name] = changes[pkmn.name] || {removed:[], added:[]};
        changedMoves.removed = changedMoves.removed.reduce((removed, name) => (removed[name] = true) && removed, {});
        changedMoves.added = changedMoves.added.reduce((added, name) => (added[name] = true) && added, {});

        for (var qm of pkmn.quickMoves) {
            var was_qm_removed = qm.name in changedMoves.removed;
            var is_qm_new = qm.name in changedMoves.added;
            for (var sm of pkmn.specialMoves) {
                var was_sm_removed = sm.name in changedMoves.removed;
                var is_sm_new = sm.name in changedMoves.added;

                if(!INCLUDE_OLD_MOVESETS && (was_qm_removed || was_sm_removed)) continue;
                if(was_qm_removed && is_sm_new || is_qm_new && was_sm_removed) continue;

                pkmn.movesetsList.push({
                    quickMove: qm,
                    quickMoveRemoved: was_qm_removed,
                    specialMove: sm,
                    specialMoveRemoved: was_sm_removed,
                    dpsCacheAgainst: {},
                    pokemon: pkmn
                });
            }
        }

        pkmn.primaryType = pkmn.types[0];
        pkmn.secondaryType = pkmn.types[1];
        if (!$scope.pokemonByType[pkmn.primaryType]){
            $scope.pokemonByType[pkmn.primaryType] = {};
        }
        if (!$scope.pokemonByType[pkmn.primaryType][pkmn.secondaryType]){
            $scope.pokemonByType[pkmn.primaryType][pkmn.secondaryType] = [];
        }
        $scope.pokemonByType[pkmn.primaryType][pkmn.secondaryType].push(pkmn);

        if (!$scope.typeGroups[pkmn.types]){
            $scope.typeGroups[pkmn.types] = {
                types: pkmn.types,
                pokemonList: []
            };
        }
        $scope.typeGroups[pkmn.types].pokemonList.push(pkmn);

        pkmn.evolutions = [];
        if (pkmn.evolvesFrom) {
            pkmn.evolvesFrom = pokemon[pkmn.evolvesFrom];
            pkmn.evolvesFrom.evolutions.push(pkmn);
        }
    }

    // for (var sm in specialMoves) {
    //     specialMoves[sm].energySlots = [...Array(specialMoves[sm].energySlots).keys()];
    // }

    var preFilteredPokemonList = pokemonList.filter(availabilityFilter).filter(fullEvolvedFilter);

    $scope.preFilteredPokemonList = preFilteredPokemonList;

    calculatePokemonRanking();
    
    function calculatePokemonRanking() {
        $scope.maxTotalPower.offensive = 0;
        $scope.maxTotalPower.defensive = 0;
        maxScore.offensive = 0;
        maxScore.defensive = 0;

        var opponentTypes = $scope.selected.opponent.pokemon && $scope.selected.opponent.pokemon.types || [];
        var opponentMoveset = $scope.selected.opponent.moveset;

        for (var pkmn of preFilteredPokemonList) {
            pkmn.available = true;

            if (opponentMoveset && !opponentMoveset.dpsCacheAgainst[pkmn.types]) {
                opponentMoveset.dpsCacheAgainst[pkmn.types] = calculateDamage(opponentMoveset, opponentTypes, pkmn.types);
            };

            calculatePokemonScores(pkmn, opponentTypes, opponentMoveset);

            maxScore.offensive = Math.max(maxScore.offensive, pkmn.maxScore.offensive);
            maxScore.defensive = Math.max(maxScore.defensive, pkmn.maxScore.defensive);
        }
    }

    function calculatePokemonScores(pkmn, opponentTypes, opponentMoveset) {
        opponentTypes = opponentTypes || $scope.selected.opponent.pokemon && $scope.selected.opponent.pokemon.types || [];
        opponentMoveset = opponentMoveset || $scope.selected.opponent.moveset;
        var stand = pkmn.stand || $scope.selected.stand;
        var opponentMovesetTypesFactor = {
            offensive: opponentMoveset ? opponentMoveset.dpsCacheAgainst[pkmn.types].typesFactor.offensive : 1,
            defensive: opponentMoveset ? opponentMoveset.dpsCacheAgainst[pkmn.types].typesFactor.defensive : 1,
        };
        var moveset;

        var totalOffensivePower = pkmn.baseTotalPower.offensive / opponentMovesetTypesFactor.offensive;
        var totalDefensivePower = pkmn.baseTotalPower.defensive / opponentMovesetTypesFactor.defensive;
        pkmn.totalPower = pkmn.baseTotalPower[stand] / opponentMovesetTypesFactor[getOppositeStand(stand)];
        pkmn.totalPowerDelta = pkmn.totalPower / pkmn.baseTotalPower[stand] - 1;
        pkmn.totalPowerDeltaSign = getSign(pkmn.totalPowerDelta);

        $scope.maxTotalPower.offensive = Math.max($scope.maxTotalPower.offensive, totalOffensivePower);
        $scope.maxTotalPower.defensive = Math.max($scope.maxTotalPower.defensive, totalDefensivePower);

        pkmn.isAttacking = $scope.selected.opponent.pokemon && stand == 'offensive';
        pkmn.isDefending = $scope.selected.opponent.pokemon && stand == 'defensive';

        var maxDPS = pkmn.maxDPS.against[opponentTypes] || {};
        for (moveset of pkmn.movesetsList) {
            if (!moveset.dpsCacheAgainst[opponentTypes]) {
                moveset.dpsCacheAgainst[opponentTypes] = calculateDamage(moveset, pkmn.types, opponentTypes);
            };
            if (!pkmn.maxDPS.against[opponentTypes]) {
                var cachedDPS = moveset.dpsCacheAgainst[opponentTypes];
                maxDPS.offensive = Math.max(maxDPS.offensive || 0, cachedDPS.maxOffensive);
                maxDPS.defensive = Math.max(maxDPS.defensive || 0, cachedDPS.defensive);
            };
        }
        pkmn.maxDPS.against[opponentTypes] = maxDPS;
        pkmn.maxDPS.offensive = maxDPS.offensive;
        pkmn.maxDPS.defensive = maxDPS.defensive;
        pkmn.maxScore.offensive = totalOffensivePower * maxDPS.offensive;
        pkmn.maxScore.defensive = totalDefensivePower * maxDPS.defensive;

        for (moveset of pkmn.movesetsList) {
            calculateMovesetScore(moveset, opponentTypes);
        }
    }

    function calculateMovesetScore(moveset, opponentTypes) {
        opponentTypes = opponentTypes || $scope.selected.opponent.pokemon && $scope.selected.opponent.pokemon.types || [];
        var pkmn = moveset.pokemon;
        var stand = pkmn.stand || $scope.selected.stand;
        var isDefendingGym = stand == 'defensive';

        var cachedDPS = moveset.dpsCacheAgainst[opponentTypes];
        moveset.dpsBehind = cachedDPS;
        moveset.isBetterQuickOnly = cachedDPS.quickOnly > cachedDPS.offensive;
        moveset.isBestOffensive = pkmn.maxDPS.offensive == cachedDPS.maxOffensive;
        moveset.isBestDefensive = pkmn.maxDPS.defensive == cachedDPS.defensive;

        moveset.dps = isDefendingGym
            ? cachedDPS.defensive
            : moveset.isBetterQuickOnly && !moveset.forceWeave
                ? cachedDPS.quickOnly
                : cachedDPS.offensive;

        cachedDPS = moveset.dpsCacheAgainst[NEUTRAL];
        var baseDPS = isDefendingGym
            ? cachedDPS.defensive
            : moveset.isBetterQuickOnly && !moveset.forceWeave
                ? cachedDPS.quickOnly
                : cachedDPS.offensive;
        var baseScore = pkmn.baseTotalPower[stand] * baseDPS;

        moveset.dpsDelta = moveset.dps / baseDPS - 1;
        moveset.dpsDeltaSign = getSign(moveset.dpsDelta);

        moveset.score = pkmn.totalPower * moveset.dps;
        moveset.scoreDelta = moveset.score / baseScore - 1;
        moveset.scoreDeltaSign = getSign(moveset.scoreDelta);
    }

    function getSign(num) {
        return num > 0.00005 ? 'positive' : num < -0.00005 ? 'negative' : null;
    }

    function getOppositeStand(stand) {
        return stand == 'offensive' ? 'defensive' : 'offensive';
    }


    function standChange(pkmn) { // light version of calculatePokemonRanking() and calculatePokemonScores(pkmn)
        var opponentTypes = $scope.selected.opponent.pokemon && $scope.selected.opponent.pokemon.types || [];
        var opponentMoveset = $scope.selected.opponent.moveset;
        var pkmnList = pkmn ? [pkmn] : preFilteredPokemonList;
        for (var pkmn of pkmnList) {
            var stand = pkmn.stand || $scope.selected.stand;
            var opponentMovesetTypesFactor = opponentMoveset ? opponentMoveset.dpsCacheAgainst[pkmn.types].typesFactor[getOppositeStand(stand)] : 1;
            pkmn.totalPower = pkmn.baseTotalPower[stand] / opponentMovesetTypesFactor;
            pkmn.totalPowerDelta = pkmn.totalPower / pkmn.baseTotalPower[stand] - 1;
            pkmn.totalPowerDeltaSign = getSign(pkmn.totalPowerDelta);
            pkmn.isAttacking = $scope.selected.opponent.pokemon && stand == 'offensive';
            pkmn.isDefending = $scope.selected.opponent.pokemon && stand == 'defensive';

            for (moveset of pkmn.movesetsList) {
                calculateMovesetScore(moveset, opponentTypes);
            }
        }
    }
    
    function getEffectivenessFactor(off_type, def_types) {
        var factor = 1;
        for (var type of def_types) {
            factor *= (types[type].weakTo.includes(off_type) ? SE_FACTOR : 1) * (types[type].resistantTo.includes(off_type) ? NVE_FACTOR : 1)
        }
        if (!CUMULATIVE_TYPE_ADVANTAGE) {
            factor = Math.max(NVE_FACTOR, Math.min(SE_FACTOR, factor));
        }
        return factor;
    }

    function calculateDamage(moveset, selfTypes, opponentTypes, baseDPS) {
        var result = { };

        var qm = moveset.quickMove;
        var sm = moveset.specialMove;
        var qm_stab_factor = selfTypes.includes(qm.type) ? STAB_FACTOR : 1;
        var sm_stab_factor = selfTypes.includes(sm.type) ? STAB_FACTOR : 1;
        var sm_crit_factor = (1 - sm.critChance + sm.critChance * CRIT_FACTOR);
        var qm_effectiveness_factor = opponentTypes ? getEffectivenessFactor(qm.type, opponentTypes) : 1;
        var sm_effectiveness_factor = opponentTypes ? getEffectivenessFactor(sm.type, opponentTypes) : 1;

        for (var stand of stands) {
            var is_attacker = stand.name == 'offensive';
            var is_defender = !is_attacker;
            var qm_delay = is_defender * GYM_QUICK_ATTACK_DELAY;
            var sm_delay = is_attacker * SPECIAL_ATTACK_HOLD_DELAY;
            var qm_total_duration = qm.duration + qm_delay;
            var sm_total_duration = sm.duration + sm_delay;
            var qm_dps = qm_effectiveness_factor * qm_stab_factor * qm.damage / qm_total_duration;
            var sm_dps = sm_effectiveness_factor * sm_stab_factor * sm_crit_factor * sm.damage / sm_total_duration;
            var charge_time = 100 / qm.energy * qm_total_duration; // TODO: include eps boost from damage taken
            var discharge_time = sm_total_duration * sm.energySlots;
            var qm_charge_damage = qm_dps * charge_time;
            var sm_discharge_damage = sm_dps * discharge_time;
            var total_dps = (qm_charge_damage + sm_discharge_damage) / (charge_time + discharge_time);
            result[stand.name] = total_dps;
            if (is_attacker) {
                result.quickOnly = qm_dps;
            }
        }

        result.maxOffensive = Math.max(result.offensive, result.quickOnly);

        var baseDPS = moveset.dpsCacheAgainst[NEUTRAL] || result;
        result.typesFactor = {
            offensive: result.maxOffensive / baseDPS.maxOffensive,
            defensive: result.defensive / baseDPS.defensive
        };

        return result;
    }

    function getBarPercentage(pkmn, moveset) {
        return (pkmn.reference || $scope.selected.reference) == 'by-score'
            ? 100 * moveset.score / maxScore[pkmn.stand || $scope.selected.stand]
            : 100 * moveset.dps / pkmn.maxDPS[pkmn.stand || $scope.selected.stand];
    };
    $scope.getBarPercentage = getBarPercentage;

    function getBarTitle(pkmn, moveset) {
        var percentage = Math.round(getBarPercentage(pkmn, moveset) * 100) / 100;
        return (pkmn.reference || $scope.selected.reference) == 'by-score'
            ? moveset.score == maxScore[pkmn.stand || $scope.selected.stand]
                ? '100% (Max Score in current ranking)'
                : percentage + '% of max score among all pokemon'
            : moveset.dps == pkmn.maxDPS[pkmn.stand || $scope.selected.stand]
                ? '100% (Max DPS for ' + pkmn.name + ' in current ranking)'
                : percentage + '% of max DPS for ' + pkmn.name + ($scope.selected.opponent.pokemon ? ' against ' + $scope.selected.opponent.pokemon.name : '')
    };
    $scope.getBarTitle = getBarTitle;

    function getRankIndex(pkmn) {
        return $scope.selected.sorter == $scope.sorters[0] ? '#'+pkmn.num : pkmn.position+1+'\u00BA'
    };
    $scope.getRankIndex = getRankIndex;








    function forceWeave(moveset, force) {
        if (moveset.isBetterQuickOnly) {
            moveset.forceWeave = force;
            calculateMovesetScore(moveset);
        };
    };
    $scope.forceWeave = forceWeave;

    function changeStand(pkmn, stand) {
        if (pkmn.stand != stand) {
            pkmn.stand = stand;
            standChange(pkmn); //calculatePokemonScores(pkmn);
        };
    };
    $scope.changeStand = changeStand;

    function selectStand(stand) {
        if ($scope.selected.stand != stand) {
            $scope.selected.stand = stand;
            standChange(); //calculatePokemonRanking();
        };
    };
    $scope.selectStand = selectStand;


    function updatePokemonList() {
        var newPokemonRanking = $filter('orderBy')(
            $filter('filter')(preFilteredPokemonList, activeFilters),
            $scope.selected.sorter.function,
            $scope.sorters.indexOf($scope.selected.sorter));

        pokemonList.forEach((p, i) => {
            p.display = false;
            p.position = 1000;
        });

        newPokemonRanking.forEach((p, i) => {
            pokemon[p.name].display = true;
            pokemon[p.name].position = i;
        });
    };
    $scope.updatePokemonList = updatePokemonList;




    // SORTERS //

    function sorterAvailabilityFilter(sorter) {
        return sorter.img;
    };
    $scope.sorterAvailabilityFilter = sorterAvailabilityFilter;

    var movesetSorters = {
        offensive: ['dpsBehind.maxOffensive', 'dpsBehind.offensive'],
        defensive: 'dpsBehind.defensive'
    }
    function reSort(sorter) {
        $scope.selected.sorter = sorter || $scope.selected.sorter;
        $scope.selected.reference = $scope.selected.sorter == $scope.sorters[0] ? 'by-dps' : 'by-score';

        if (/Offensive/.test($scope.selected.sorter.name)) {
            $scope.selected.stand = 'offensive';
            $scope.selected.movesetSorter = movesetSorters.offensive;
        } else if (/Defensive/.test($scope.selected.sorter.name)) {
            $scope.selected.stand = 'defensive';
            $scope.selected.movesetSorter = movesetSorters.defensive;
        }
        standChange(); //calculatePokemonRanking();
        updatePokemonList();
    };
    $scope.reSort = reSort;
    $scope.selected.movesetSorter = movesetSorters.offensive;

    $scope.sorters = [
        {
            name: 'Sort By Pokedex Number',
            function: pkmn => pkmn.number,
            img: 'pokeball.png'
        },
        {
            name: 'Sort By Combined Stats',
            function: pkmn => pkmn.totalPower
        },
        {
            name: 'Sort By Best Offensive Moveset',
            function: pkmn => pkmn.maxDPS.offensive
        },
        {
            name: 'Sort By Best Defensive Moveset',
            function: pkmn => pkmn.maxDPS.defensive
        },
        {
            name: 'Sort By Best Offensive Moveset And Combined Stats',
            function: pkmn => pkmn.maxScore.offensive,
            img: 'offense.png'
        },
        {
            name: 'Sort By Best Defensive Moveset And Combined Stats',
            function: pkmn => pkmn.maxScore.defensive,
            img: 'defense.png'
        },,
        {
            name: 'Sort By Tankiness',
            function: pkmn => pkmn.stats.defense * pkmn.stats.stamina
        },
    ];
    $scope.selected.sorter = $scope.sorters[4];











    // PKMN FILTERS //

    function activeFilters(pkmn) {
        return (!$scope.selected.filters.type || typeFilter(pkmn));
    };
    $scope.activeFilters = activeFilters;

    function fullEvolvedFilter(pkmn) {
        return !pkmn.evolutions.length;
    };
    $scope.fullEvolvedFilter = fullEvolvedFilter;

    function availabilityFilter(pkmn) {
        return !(pkmn.name in unavailable);
    };
    $scope.availabilityFilter = availabilityFilter;

    function typeFilter(pkmn) {
        return $scope.selected.types.length
        ? $scope.selected.types.every(t => pkmn.types.includes(t)) && pkmn.types.every(t => $scope.selected.types.includes(t))
        : $scope.selected.typeFilters.length
            ? pkmn.types.some(t => $scope.typeFilters[t])
            : true;
    };
    $scope.typeFilter = typeFilter;






    // TYPE FILTER / PKMN SELECTOR //


    function getFilterToggleTitle() {
        return 'Turn ' + ($scope.selected.filters.type?'off':'on') + ' filter: ' + $scope.filteredBy[0]
        + ($scope.filteredBy[1]
            ? $scope.filteredBy[1] == 'All' || $scope.filteredBy[1] == 'Only'
                ? ' (' + $scope.filteredBy[1] + ')'
                : '/' + $scope.filteredBy[1]
            : '');
    };
    $scope.getFilterToggleTitle = getFilterToggleTitle;

    function toggleSingleTypeFilter(current) {
        if (current == 'All' || current == 'Only') selectTypes([$scope.filteredBy[0]]);
    };
    $scope.toggleSingleTypeFilter = toggleSingleTypeFilter;

    function typeGroupsFilter(typeGroup) {
        return $scope.selected.typeFilters.length && $scope.selected.typeFilters.every(t => typeGroup.types.includes(t));
    };
    $scope.typeGroupsFilter = typeGroupsFilter;

    function perfectMatch(typeGroup) {
        return typeGroup.types.every(t => $scope.selected.typeFilters.includes(t));
    };
    $scope.perfectMatch = perfectMatch;

    function toggleTypeFilter(type, allowDualTypeFilter) {
        $scope.selected.types.splice(0, $scope.selected.types.length);
        if ($scope.selected.typeFilters.includes(type)) {
            if ($scope.selected.typeFilters.indexOf(type)) {
                $scope.selected.typeFilters.pop();
            }
            else {
                $scope.selected.typeFilters.shift();
            }
        }
        else {
            if ($scope.selected.typeFilters.length == (allowDualTypeFilter ? 2 : 1)) {
                $scope.typeFilters[$scope.selected.typeFilters.shift()] = false;
            };
            $scope.selected.typeFilters.push(type);
        }
        $scope.typeFilters[type] = !$scope.typeFilters[type];

        if ($scope.selected.pokemon && $scope.selected.typeFilters.some(t => !$scope.selected.pokemon.types.includes(type))) {
            $scope.selected.pokemon = null;
        };
        updateFilter();
    }
    $scope.toggleTypeFilter = toggleTypeFilter;

    function selectTypes(types) {
        if (window.innerWidth < 1024) return;
        $scope.selected.pokemon = null;
        if ($scope.areTypesSelected(types)) {
            $scope.selected.types.splice(0, $scope.selected.types.length);
        }
        else {
            $scope.selected.types.splice(0, $scope.selected.types.length, ...types);
            if (!($scope.typeFilters[types[0]] || $scope.typeFilters[types[1]])) {
                if ($scope.selected.typeFilters.length) $scope.typeFilters[$scope.selected.typeFilters.shift()] = false;
                $scope.selected.typeFilters.push(types[0]);
                $scope.typeFilters[types[0]] = true;
            }
        }
        updateFilter();
    }
    $scope.selectTypes = selectTypes;

    function toggleFilter() {
        $scope.selected.filters.type = !$scope.selected.filters.type;
        updatePokemonList();
    }
    $scope.toggleFilter = toggleFilter;

    function updateFilter() {
        var types = $scope.selected.types.length
            ? $scope.selected.types
            : $scope.selected.typeFilters.length
                ? $scope.selected.typeFilters
                : [];
        $scope.filteredBy.splice(0, $scope.filteredBy.length, ...types);
        if ($scope.filteredBy.length == 1) $scope.filteredBy.push($scope.selected.types.length ? 'Only' : 'All');
        updatePokemonList();
    }

    function areTypesSelected(types) {
        return types.every(t => $scope.selected.types.includes(t)) && $scope.selected.types.every(t => types.includes(t));
    }
    $scope.areTypesSelected = areTypesSelected;

    function selectPokemon(pkmn) {
        if (!pkmn.display) selectTypes($scope.selected.types);
        $scope.selected.pokemon = $scope.selected.pokemon == pkmn ? null : pkmn;
    }
    $scope.selectPokemon = selectPokemon;





    function selectAsOpponent(pkmn) {
        var oppositeStand = $scope.selected.stand == 'offensive' ? 'defensive' : 'offensive';
        $scope.selected.opponent.pokemon = pkmn;
        $scope.selected.opponent.moveset = pkmn.movesetsList.find(ms => {
            return pkmn.maxDPS.against[NEUTRAL][oppositeStand] == (oppositeStand == 'offensive' ? ms.dpsCacheAgainst[NEUTRAL].maxOffensive : ms.dpsCacheAgainst[NEUTRAL].defensive);
        });
        if ($scope.selected.types.length || $scope.selected.typeFilters.length) $scope.selected.filters.type = false;

        calculatePokemonRanking();
        updatePokemonList();
    }
    $scope.selectAsOpponent = selectAsOpponent;

    function removeOpponent() {
        $scope.selected.opponent.pokemon = null;
        $scope.selected.opponent.moveset = null;

        calculatePokemonRanking();
        updatePokemonList();
    }
    $scope.removeOpponent = removeOpponent;

    function selectOpponentMoveset(moveset) {
        $scope.showOpponentMovesets = false;
        $scope.selected.opponent.moveset = moveset;

        calculatePokemonRanking();
        updatePokemonList();
    }
    $scope.selectOpponentMoveset = selectOpponentMoveset;









    $scope.log = (data) => {
        console.log(data);
    }

    $scope.select = (data, $event) => {
        $scope.selected.info = data;
        $event.stopPropagation();
        $scope.donate = false;
        $scope.showOpponentMovesets = false; 
    }

    function listToMap(list, key) {
        var map = {}
        key = key || 'name';
        list.forEach((e) => {
            map[e[key]] = e;
        });
        return map;
    }

});

app.directive('goTop', function ($window, $location) { // , $anchorScroll
    return {
        restrict: 'E',
        template: '<div class="go-top" ng-show="show" title="Go Top"></div>', //'<img width="48" height="48" ng-src="images/top.png" ng-show="show">',
        link: function ($scope, element, attrs) {
            $scope.show = false;
            element.on('click', function(){
                $("html, body").animate({scrollTop: 0, scrollLeft: 0}, "fast");
                // $location.hash('');
                // $anchorScroll();
            });
            var height = element[0].offsetHeight;
            angular.element($window).on('scroll', function () {
                $scope.$apply(function(){
                    $scope.show = this.pageYOffset > 150 || this.pageXOffset > 100;
                });
            })
        }
    };
});

app.directive('loading', ['$timeout', function($timeout) {
    return {
        restrict: "A",
        link: function($scope, $element, $attributes) {
            window.onbeforeunload = function(){
                $element.attr('loading', null);
            }
            $timeout(function(){
                $element.removeAttr('loading');
            }, 1400, false);
        }
    };
}]);

app.directive('scrollOnClick', function($timeout) {
    return {
        restrict: 'A',
        link: function(scope, $element) {
            $element.off('click').on('click', function() {
                if ($element.hasClass('available') && !$element.hasClass('selected')) {
                    $timeout(function() {
                        var target = document.querySelector('[data-name="'+ scope.pkmn.name +'"]');
                        var top = document.body.scrollTop || window.scrollY;
                        if (!target) return;
                        var padding = (window.innerHeight - target.clientHeight) / 2;

                        if (top > target.offsetTop) {
                            $("html, body").animate({scrollTop: target.offsetTop - padding}, "slow");
                        }

                        if (top + window.innerHeight < target.offsetTop + target.clientHeight) {
                            $("html, body").animate({scrollTop: padding + target.offsetTop + target.clientHeight - window.innerHeight}, "slow");
                        }
                    }, 0, false);
                }
                
            });
        }
    }
});