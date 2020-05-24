(function () {
  'use strict';

  angular
    .module('ffxivCraftOptWeb.controllers')
    .controller('SolverController', controller);

  function controller($scope, $state, $stateParams, _solver, _simulator, _bonusStats) {
    // Global page state
    if (!$scope.pageState.solverStatus) {
      angular.extend($scope.pageState, {
        solverStatus: {
          running: false,
          isAutorun: false,
          isStoppingAutorun: false,
          generationsCompleted: 0,
          maxGenerations: 0,
          state: null,
          arState: null,
          logs: {
            execution: '',
            ga: '',
            mc: ''
          },
          arSequence: [],
          sequence: [],
          error: null
        }
      });
    }

    // Local page state
    $scope.logTabs = {
      execution: {active: false},
      ga: {active: false},
      mc: {active: true},
      macro: {active: false}
    };

    //
    // SOLVER
    //

    $scope.startSolver = startSolver;
    $scope.resetSolver = resetSolver;
    $scope.resumeSolver = resumeSolver;
    $scope.autorunSolver = autorunSolver;
    $scope.stopSolver = stopSolver;
    $scope.useSolverResult = useSolverResult;
    $scope.equivalentSequence = equivalentSequence;
    $scope.sequenceActionClasses = sequenceActionClasses;

    $scope.$on('synth.changed', resetSolver);

    //
    // State Parameter Handling
    //

    if ($stateParams.autoStart) {
      resetSolver();
      startSolver();
    }

    //////////////////////////////////////////////////////////////////////////

    function sequenceActionClasses(action, cls, index) {
      return {
        'faded-icon': !$scope.isActionSelected(action, cls),
      };
    }

    function probabilisticSimSuccess(data) {
      $scope.pageState.solverStatus.logs.ga = data.log;
    }

    function probabilisticSimError(data) {
      $scope.pageState.solverStatus.logs.ga = data.log;
    }

    function runProbabilisticSim(sequence) {
      var settings = {
        crafter: _bonusStats.addCrafterBonusStats($scope.crafter.stats[$scope.recipe.cls], $scope.bonusStats),
        recipe: _bonusStats.addRecipeBonusStats($scope.recipe, $scope.bonusStats),
        sequence: sequence,
        maxTricksUses: $scope.sequenceSettings.maxTricksUses,
        maxMontecarloRuns: $scope.sequenceSettings.maxMontecarloRuns,
        reliabilityPercent: $scope.sequenceSettings.reliabilityPercent,
        useConditions: $scope.sequenceSettings.useConditions,
        //overrideOnCondition: $scope.sequenceSettings.overrideOnCondition,
        debug: $scope.sequenceSettings.debug
      };

      _simulator.runProbabilisticSim(settings, probabilisticSimSuccess, probabilisticSimError);
    }

    function updateAutorunBestState(state, sequence) {
      if ($scope.pageState.solverStatus.isAutorun || $scope.pageState.solverStatus.isStoppingAutorun) {
        if ($scope.pageState.solverStatus.arState === null || state.quality > $scope.pageState.solverStatus.arState.quality) {
          console.log("New best quality: " + state.quality);
          $scope.pageState.solverStatus.arState = state;
          $scope.pageState.solverStatus.arSequence = sequence;
        }
      }
    }

    function monteCarloSimSuccess(data) {
      $scope.pageState.solverStatus.error = null;
      $scope.pageState.solverStatus.state = data.state;
      $scope.pageState.solverStatus.logs.mc = data.log;
      runProbabilisticSim(data.sequence);
    }

    function monteCarloSimError(data) {
      $scope.pageState.solverStatus.error = data.error;
      $scope.pageState.solverStatus.state = null;
      $scope.pageState.solverStatus.logs.mc = data.log;
    }

    function runMonteCarloSim(sequence) {
      var settings = {
        crafter: _bonusStats.addCrafterBonusStats($scope.crafter.stats[$scope.recipe.cls], $scope.bonusStats),
        recipe: _bonusStats.addRecipeBonusStats($scope.recipe, $scope.bonusStats),
        sequence: sequence,
        maxTricksUses: $scope.sequenceSettings.maxTricksUses,
        maxMontecarloRuns: $scope.sequenceSettings.maxMontecarloRuns,
        reliabilityPercent: $scope.sequenceSettings.reliabilityPercent,
        monteCarloMode: $scope.sequenceSettings.monteCarloMode,
        useConditions: $scope.sequenceSettings.useConditions,
        conditionalActionHandling: $scope.sequenceSettings.conditionalActionHandling,
        debug: $scope.sequenceSettings.debug
      };

      if ($scope.sequenceSettings.specifySeed) {
        settings.seed = $scope.sequenceSettings.seed;
      }

      _simulator.runMonteCarloSim(settings, monteCarloSimSuccess, monteCarloSimError);
    }

    function solverProgress(data) {
      $scope.pageState.solverStatus.generationsCompleted = data.generationsCompleted;
      $scope.pageState.solverStatus.maxGenerations = data.maxGenerations;
      $scope.pageState.solverStatus.error = null;
      $scope.pageState.solverStatus.state = data.state;
      $scope.pageState.solverStatus.sequence = data.bestSequence;
    }

    function solverSuccess(data) {
      $scope.pageState.solverStatus.running = false;
      $scope.pageState.solverStatus.error = null;
      $scope.pageState.solverStatus.logs.execution = data.executionLog;
      $scope.pageState.solverStatus.sequence = data.bestSequence;
      updateAutorunBestState($scope.pageState.solverStatus.state, data.bestSequence);
      if ($scope.pageState.solverStatus.isStoppingAutorun) {
        $scope.pageState.solverStatus.isStoppingAutorun = false;
        $scope.pageState.solverStatus.state = $scope.pageState.solverStatus.arState;
        $scope.pageState.solverStatus.sequence = $scope.pageState.solverStatus.arSequence;
        useSolverResult();
      }
      else
        runMonteCarloSim(data.bestSequence);

      if ($scope.pageState.solverStatus.isAutorun) {
        resetSolver();
        startSolver(true);
      }
    }

    function solverError(data) {
      $scope.pageState.solverStatus.running = false;
      $scope.pageState.solverStatus.isAutorun = false;
      $scope.pageState.solverStatus.isStoppingAutorun = false;

      $scope.pageState.solverStatus.error = data.error;
      $scope.pageState.solverStatus.state = data.state;
      $scope.pageState.solverStatus.logs.execution = data.executionLog;
      $scope.pageState.solverStatus.sequence = [];
    }

    function autorunSolver() {
      $scope.pageState.solverStatus.arState = null;
      $scope.pageState.solverStatus.arSequence = [];
      resetSolver();
      startSolver(true);
    }

    function startSolver(autorun = false) {
      var sequence = $scope.pageState.solverStatus.sequence;
      if (sequence.length === 0) sequence = $scope.sequence;

      var settings = {
        crafter: _bonusStats.addCrafterBonusStats($scope.crafter.stats[$scope.recipe.cls], $scope.bonusStats),
        recipe: _bonusStats.addRecipeBonusStats($scope.recipe, $scope.bonusStats),
        sequence: sequence,
        algorithm: $scope.solver.algorithm,
        maxTricksUses: $scope.sequenceSettings.maxTricksUses,
        maxMontecarloRuns: $scope.sequenceSettings.maxMontecarloRuns,
        reliabilityPercent: $scope.sequenceSettings.reliabilityPercent,
        useConditions: $scope.sequenceSettings.useConditions,
        maxLength: $scope.sequenceSettings.maxLengthEnabled ? $scope.sequenceSettings.maxLength : 0,
        solver: $scope.solver,
        debug: $scope.sequenceSettings.debug
      };
      if ($scope.sequenceSettings.specifySeed) {
        settings.seed = $scope.sequenceSettings.seed;
      }
      $scope.pageState.solverStatus.running = true;
      $scope.pageState.solverStatus.isAutorun = autorun;
      _solver.start(settings, solverProgress, solverSuccess, solverError);
    }

    function resetSolver() {
      $scope.pageState.solverStatus.error = null;
      $scope.pageState.solverStatus.generationsCompleted = 0;
      $scope.pageState.solverStatus.maxGenerations = $scope.solver.generations;
      $scope.pageState.solverStatus.state = null;

      $scope.pageState.solverStatus.logs = {
        setup: '',
        ga: '',
        mc: ''
      };
      $scope.pageState.solverStatus.sequence = [];
    }

    function resumeSolver() {
      $scope.pageState.solverStatus.running = true;
      _solver.resume();
    }

    function stopSolver() {
      if ($scope.pageState.solverStatus.isAutorun)
      {
        $scope.pageState.solverStatus.isAutorun = false;
        $scope.pageState.solverStatus.isStoppingAutorun = true;
        _solver.stop();
      }
      else
        _solver.stop();
    }

    function useSolverResult() {
      var newSeq = $scope.pageState.solverStatus.sequence;
      if (newSeq instanceof Array && newSeq.length > 0) {
        $scope.$emit('update.sequence', newSeq);
        $state.go('simulator');
      }
    }

    function equivalentSequence() {
      return angular.equals($scope.pageState.solverStatus.sequence, $scope.sequence)
    }
  }
})();
